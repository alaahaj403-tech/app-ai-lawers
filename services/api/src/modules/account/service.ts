import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { failures, isUiLocale } from '@voxeli/domain';
import type { UiLocale } from '@voxeli/domain';
import type { Db } from '../../db/client.js';
import {
  authTokens,
  realtimeSessions,
  sessions,
  subscriptions,
  translations,
  userSettings,
  users,
} from '../../db/schema.js';
import type { AuditService } from '../audit/service.js';
import type { EmailProvider } from '../email/provider.js';
import { passwordResetEmail, verificationEmail } from '../email/templates.js';

const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} satisfies NonNullable<Parameters<typeof argon2.hash>[1]>;

export interface AccountContext {
  correlationId: string;
  ip: string | undefined;
}

/**
 * Account lifecycle beyond login: email verification, password reset,
 * deletion and export. Tokens are single-use and stored hashed; requests
 * that could reveal whether an email exists always answer the same way.
 */
export class AccountService {
  constructor(
    private readonly db: Db,
    private readonly email: EmailProvider,
    private readonly audit: AuditService,
    private readonly appBaseUrl: string,
    private readonly log: FastifyBaseLogger,
  ) {}

  // ---- email verification -------------------------------------------------

  /** Best-effort: registration must never fail because email delivery did. */
  async sendVerification(userId: string, ctx: AccountContext): Promise<void> {
    const [user] = await this.db
      .select({ email: users.email, locale: users.locale, verifiedAt: users.emailVerifiedAt })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user || user.verifiedAt) return;
    const token = await this.issueToken(userId, 'email_verification', VERIFY_TTL_MS);
    const link = `${this.appBaseUrl}/verify-email?token=${token}`;
    try {
      await this.email.send(
        verificationEmail(user.email, this.locale(user.locale), link),
        ctx.correlationId,
      );
    } catch (error) {
      this.log.warn({ err: error, userId }, 'verification email not sent');
    }
  }

  async confirmEmail(token: string, ctx: AccountContext): Promise<void> {
    const row = await this.consumeToken(token, 'email_verification');
    await this.db
      .update(users)
      .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
      .where(eq(users.id, row.userId));
    await this.audit.log({
      actorUserId: row.userId,
      action: 'account.email_verified',
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    });
  }

  // ---- password reset -----------------------------------------------------

  /** Always resolves the same way; existence of the account is not revealed. */
  async requestPasswordReset(email: string, ctx: AccountContext): Promise<void> {
    const [user] = await this.db
      .select({ id: users.id, email: users.email, locale: users.locale })
      .from(users)
      .where(and(eq(users.email, email), isNull(users.deletedAt)))
      .limit(1);
    await this.audit.log({
      actorUserId: user?.id ?? null,
      action: 'account.password_reset_requested',
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    });
    if (!user) return;
    const token = await this.issueToken(user.id, 'password_reset', RESET_TTL_MS);
    const link = `${this.appBaseUrl}/reset-password?token=${token}`;
    try {
      await this.email.send(
        passwordResetEmail(user.email, this.locale(user.locale), link),
        ctx.correlationId,
      );
    } catch (error) {
      this.log.warn({ err: error, userId: user.id }, 'password reset email not sent');
    }
  }

  /** Sets the new password and signs the user out everywhere. */
  async confirmPasswordReset(
    token: string,
    newPassword: string,
    ctx: AccountContext,
  ): Promise<void> {
    const row = await this.consumeToken(token, 'password_reset');
    const passwordHash = await argon2.hash(newPassword, ARGON_OPTIONS);
    await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, updatedAt: new Date() })
        .where(eq(users.id, row.userId));
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(sessions.userId, row.userId), isNull(sessions.revokedAt)));
      // Any other outstanding reset links are now stale.
      await tx
        .update(authTokens)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(authTokens.userId, row.userId),
            eq(authTokens.kind, 'password_reset'),
            isNull(authTokens.consumedAt),
          ),
        );
    });
    await this.audit.log({
      actorUserId: row.userId,
      action: 'account.password_reset',
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    });
  }

  // ---- deletion & export --------------------------------------------------

  /**
   * Deletion actually deletes: the user row goes, and cascades remove
   * settings, subscription, sessions, tokens, quotas, translations and
   * realtime sessions. AI usage rows keep their cost data with user_id nulled.
   * The audit trail keeps only a hash of the id so the event is provable
   * without retaining the identity.
   */
  async deleteAccount(userId: string, password: string, ctx: AccountContext): Promise<void> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw failures.notFound('User not found');
    const ok = await argon2.verify(user.passwordHash, password).catch(() => false);
    if (!ok) throw failures.auth('Password is incorrect');

    await this.db.delete(users).where(eq(users.id, userId));
    await this.audit.log({
      actorUserId: null,
      action: 'account.deleted',
      targetType: 'user',
      targetId: createHash('sha256').update(userId).digest('hex').slice(0, 32),
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    });
  }

  /** Everything we hold about the user, as one JSON document. */
  async exportAccount(userId: string, ctx: AccountContext): Promise<Record<string, unknown>> {
    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        locale: users.locale,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) throw failures.notFound('User not found');
    const [settings] = await this.db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const [subscription] = await this.db
      .select({
        plan: subscriptions.plan,
        source: subscriptions.source,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
      })
      .from(subscriptions)
      .where(eq(subscriptions.userId, userId))
      .limit(1);
    const history = await this.db
      .select({
        id: translations.id,
        createdAt: translations.createdAt,
        sourceLanguage: translations.detectedLanguage,
        targetLanguage: translations.targetLanguage,
        mode: translations.mode,
        sourceText: translations.sourceText,
        translatedText: translations.translatedText,
        favorite: translations.favorite,
      })
      .from(translations)
      .where(eq(translations.userId, userId));
    const live = await this.db
      .select({
        id: realtimeSessions.id,
        kind: realtimeSessions.kind,
        tier: realtimeSessions.tier,
        myLanguage: realtimeSessions.myLanguage,
        targetLanguage: realtimeSessions.targetLanguage,
        startedAt: realtimeSessions.startedAt,
        endedAt: realtimeSessions.endedAt,
        durationSeconds: realtimeSessions.durationSeconds,
      })
      .from(realtimeSessions)
      .where(eq(realtimeSessions.userId, userId));
    const activeSessions = await this.db
      .select({
        deviceName: sessions.deviceName,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, userId),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, new Date()),
        ),
      );

    await this.audit.log({
      actorUserId: userId,
      action: 'account.exported',
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    });
    return {
      exportedAt: new Date().toISOString(),
      format: 'voxeli-account-export/1',
      user,
      settings: settings ?? null,
      subscription: subscription ?? null,
      translations: history,
      realtimeSessions: live,
      activeSessions,
      note: 'Audio is processed live and never stored; there are no recordings in this export.',
    };
  }

  // ---- internals ----------------------------------------------------------

  private locale(value: string): UiLocale {
    return isUiLocale(value) ? value : 'en';
  }

  private async issueToken(
    userId: string,
    kind: 'email_verification' | 'password_reset',
    ttlMs: number,
  ): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.db.insert(authTokens).values({
      userId,
      kind,
      tokenHash: AccountService.hash(token),
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return token;
  }

  private async consumeToken(
    token: string,
    kind: 'email_verification' | 'password_reset',
  ): Promise<{ userId: string }> {
    const rows = await this.db
      .update(authTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(authTokens.tokenHash, AccountService.hash(token)),
          eq(authTokens.kind, kind),
          isNull(authTokens.consumedAt),
          gt(authTokens.expiresAt, new Date()),
        ),
      )
      .returning({ userId: authTokens.userId });
    const row = rows[0];
    if (!row) throw failures.validation('This link is invalid or has expired');
    return row;
  }

  static hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
