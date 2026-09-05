import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { TranslationHistoryItem } from '@voxeli/api-contracts';
import type { TranslationMode, TranslationResult } from '@voxeli/domain';
import type { Db } from '../../db/client.js';
import { translations } from '../../db/schema.js';

export interface SavedTranslation {
  id: string;
  result: TranslationResult;
  degraded: boolean;
  slot: string;
  latencyMs: number;
}

/** All queries are scoped by userId. There is no method that looks up by id alone. */
export class TranslationRepository {
  constructor(private readonly db: Db) {}

  async findByIdempotencyKey(userId: string, key: string): Promise<SavedTranslation | null> {
    const [row] = await this.db
      .select()
      .from(translations)
      .where(and(eq(translations.userId, userId), eq(translations.idempotencyKey, key)))
      .limit(1);
    if (!row) return null;
    const details = row.details as {
      result: TranslationResult;
      degraded: boolean;
      slot: string;
      latencyMs: number;
    };
    return { id: row.id, ...details };
  }

  async save(input: {
    userId: string;
    idempotencyKey: string | undefined;
    sourceLanguage: string;
    mode: TranslationMode;
    sourceText: string;
    result: TranslationResult;
    degraded: boolean;
    slot: string;
    latencyMs: number;
  }): Promise<string> {
    const [row] = await this.db
      .insert(translations)
      .values({
        userId: input.userId,
        idempotencyKey: input.idempotencyKey ?? null,
        sourceLanguage: input.sourceLanguage,
        detectedLanguage: input.result.detectedLanguage,
        targetLanguage: input.result.targetLanguage,
        mode: input.mode,
        sourceText: input.sourceText,
        translatedText: input.result.translatedText,
        details: {
          result: input.result,
          degraded: input.degraded,
          slot: input.slot,
          latencyMs: input.latencyMs,
        },
      })
      .returning({ id: translations.id });
    if (!row) throw new Error('insert returned no row');
    return row.id;
  }

  async list(
    userId: string,
    limit: number,
    cursor: string | undefined,
  ): Promise<{ items: TranslationHistoryItem[]; nextCursor: string | null }> {
    const cursorDate = cursor ? decodeCursor(cursor) : null;
    const rows = await this.db
      .select()
      .from(translations)
      .where(
        cursorDate
          ? and(eq(translations.userId, userId), lt(translations.createdAt, cursorDate))
          : eq(translations.userId, userId),
      )
      .orderBy(desc(translations.createdAt), desc(translations.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        id: r.id,
        sourceLanguage: r.detectedLanguage,
        targetLanguage: r.targetLanguage,
        sourceText: r.sourceText,
        translatedText: r.translatedText,
        mode: r.mode,
        favorite: r.favorite,
        createdAt: r.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit && last ? encodeCursor(last.createdAt) : null,
    };
  }

  async setFavorite(userId: string, id: string, favorite: boolean): Promise<boolean> {
    const rows = await this.db
      .update(translations)
      .set({ favorite })
      .where(and(eq(translations.userId, userId), eq(translations.id, id)))
      .returning({ id: translations.id });
    return rows.length > 0;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(translations)
      .where(and(eq(translations.userId, userId), eq(translations.id, id)))
      .returning({ id: translations.id });
    return rows.length > 0;
  }

  async deleteAll(userId: string): Promise<number> {
    const rows = await this.db
      .delete(translations)
      .where(eq(translations.userId, userId))
      .returning({ id: translations.id });
    return rows.length;
  }

  async countForUser(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(translations)
      .where(eq(translations.userId, userId));
    return row?.n ?? 0;
  }
}

function encodeCursor(d: Date): string {
  return Buffer.from(d.toISOString()).toString('base64url');
}
function decodeCursor(c: string): Date | null {
  const d = new Date(Buffer.from(c, 'base64url').toString('utf8'));
  return Number.isNaN(d.getTime()) ? null : d;
}
