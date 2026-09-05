import argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { failures } from '@voxeli/domain';
import type { AuthResponse, UserProfile } from '@voxeli/api-contracts';
import type { UiLocale } from '@voxeli/domain';
import type { Db } from '../../db/client.js';
import { sessions, subscriptions, userSettings, users } from '../../db/schema.js';
import { TokenService } from './tokens.js';
import type { AuditService } from '../audit/service.js';

const ARGON_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} satisfies NonNullable<Parameters<typeof argon2.hash>[1]>;

export interface AuthContext {
  correlationId: string;
  ip: string | undefined;
  userAgent: string | undefined;
}

export class AuthService {
  /** Called after a successful registration (e.g. to send a verification email). Never fails the request. */
  onRegistered: ((userId: string, ctx: AuthContext) => Promise<void>) | null = null;

  constructor(
    private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
    private readonly refreshTtlDays: number,
  ) {}

  async register(
    input: { email: string; password: string; locale: UiLocale; deviceName?: string },
    ctx: AuthContext,
  ): Promise<AuthResponse> {
    const existing = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .limit(1);
    if (existing.length > 0) throw failures.conflict('An account with this email already exists');

    const passwordHash = await argon2.hash(input.password, ARGON_OPTIONS);
    const user = await this.db.transaction(async (tx) => {
      const [u] = await tx
        .insert(users)
        .values({ email: input.email, passwordHash, locale: input.locale })
        .returning();
      if (!u) throw failures.internal('User insert returned no row');
      await tx.insert(userSettings).values({ userId: u.id });
      await tx.insert(subscriptions).values({ userId: u.id, plan: 'free' });
      return u;
    });
    await this.audit.log({
      actorUserId: user.id,
      action: 'auth.register',
      targetType: 'user',
      targetId: user.id,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    });
    if (this.onRegistered) {
      await this.onRegistered(user.id, ctx).catch(() => undefined);
    }
    return this.issue(user.id, ctx, input.deviceName);
  }

  async login(
    input: { email: string; password: string; deviceName?: string },
    ctx: AuthContext,
  ): Promise<AuthResponse> {
    const [user] = await this.db
      .select()
      .from(users)
      .where(and(eq(users.email, input.email), isNull(users.deletedAt)))
      .limit(1);
    // Constant-ish time: verify against a dummy hash when the user is unknown.
    const hash = user?.passwordHash ?? DUMMY_HASH;
    const ok = await argon2.verify(hash, input.password).catch(() => false);
    if (!user || !ok) {
      await this.audit.log({
        actorUserId: user?.id ?? null,
        action: 'auth.login_failed',
        correlationId: ctx.correlationId,
        ip: ctx.ip,
      });
      throw failures.auth('Invalid email or password');
    }
    await this.audit.log({
      actorUserId: user.id,
      action: 'auth.login',
      correlationId: ctx.correlationId,
      ip: ctx.ip,
    });
    return this.issue(user.id, ctx, input.deviceName);
  }

  /** Rotating refresh: the presented token is revoked and a new one issued. */
  async refresh(refreshToken: string, ctx: AuthContext): Promise<AuthResponse> {
    const hash = TokenService.hashRefreshToken(refreshToken);
    const [session] = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.refreshTokenHash, hash))
      .limit(1);
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now())
      throw failures.auth('Session expired');
    await this.db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(eq(sessions.id, session.id));
    return this.issue(session.userId, ctx, session.deviceName ?? undefined);
  }

  async logout(refreshToken: string | undefined, sessionId: string | undefined): Promise<void> {
    if (refreshToken) {
      const hash = TokenService.hashRefreshToken(refreshToken);
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.refreshTokenHash, hash));
    } else if (sessionId) {
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.id, sessionId));
    }
  }

  async profile(userId: string): Promise<UserProfile> {
    const row = await this.loadProfile(userId);
    if (!row) throw failures.notFound('User not found');
    return row;
  }

  private async loadProfile(userId: string): Promise<UserProfile | null> {
    const [row] = await this.db
      .select({
        id: users.id,
        email: users.email,
        locale: users.locale,
        role: users.role,
        emailVerifiedAt: users.emailVerifiedAt,
        createdAt: users.createdAt,
        plan: subscriptions.plan,
      })
      .from(users)
      .leftJoin(subscriptions, eq(subscriptions.userId, users.id))
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1);
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      locale: row.locale as UiLocale,
      role: row.role,
      plan: row.plan ?? 'free',
      emailVerified: row.emailVerifiedAt !== null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private async issue(
    userId: string,
    ctx: AuthContext,
    deviceName?: string,
  ): Promise<AuthResponse> {
    const user = await this.loadProfile(userId);
    if (!user) throw failures.auth();
    const refreshToken = this.tokens.generateRefreshToken();
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlDays * 86_400_000);
    const [session] = await this.db
      .insert(sessions)
      .values({
        userId,
        refreshTokenHash: TokenService.hashRefreshToken(refreshToken),
        deviceName: deviceName ?? null,
        userAgent: ctx.userAgent?.slice(0, 200) ?? null,
        expiresAt: refreshExpiresAt,
        lastUsedAt: new Date(),
      })
      .returning({ id: sessions.id });
    if (!session) throw failures.internal('Session insert returned no row');
    const access = await this.tokens.signAccessToken({
      sub: userId,
      role: user.role,
      plan: user.plan,
      sid: session.id,
    });
    return {
      user,
      tokens: {
        accessToken: access.token,
        accessTokenExpiresAt: access.expiresAt.toISOString(),
        refreshToken,
        refreshTokenExpiresAt: refreshExpiresAt.toISOString(),
      },
    };
  }
}

/** Valid argon2id hash of a random string; used to equalize timing for unknown emails. */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$5Yk0Q0Q5o9F1T8b0Vf7m6rQz3q2yYb1Yw3Q9rX4Q1sM';
