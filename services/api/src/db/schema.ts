import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Source-of-truth schema. Every user-controlled resource carries an explicit
 * owner (`userId`) and every query filters on it — never on client-sent ids alone.
 */
export const planEnum = pgEnum('plan', ['free', 'pro', 'business']);
export const roleEnum = pgEnum('role', ['user', 'admin']);
export const translationModeEnum = pgEnum('translation_mode', [
  'natural',
  'literal',
  'professional',
  'business',
  'travel',
  'casual',
  'learning',
  'legal',
  'medical',
  'slang',
]);
export const quotaDimensionEnum = pgEnum('quota_dimension', [
  'translations',
  'characters',
  'ai_tokens',
  'audio_minutes',
  'document_pages',
  'realtime_minutes',
  'call_transcription_minutes',
]);
export const realtimeKindEnum = pgEnum('realtime_kind', [
  'face_to_face',
  'interpreter_call',
  'live_recording',
  'live_meeting',
  'live_subtitles',
]);
export const realtimeTierEnum = pgEnum('realtime_tier', [
  'tier1_s2s',
  'tier2_streaming',
  'tier3_chunked',
]);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: roleEnum('role').notNull().default('user'),
    locale: text('locale').notNull().default('en'),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  /** 'none' | 'local' | 'cloud' — history persistence preference. */
  historyMode: text('history_mode').notNull().default('cloud'),
  defaultSourceLanguage: text('default_source_language').notNull().default('auto'),
  defaultTargetLanguage: text('default_target_language').notNull().default('en'),
  ...timestamps,
});

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plan: planEnum('plan').notNull().default('free'),
    /** 'internal' | 'apple' | 'google' | 'stripe' — where entitlement was validated. */
    source: text('source').notNull().default('internal'),
    externalId: text('external_id'),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('subscriptions_user_uq').on(t.userId)],
);

/** Refresh-token sessions. Only a SHA-256 hash of the token is stored. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    refreshTokenHash: text('refresh_token_hash').notNull(),
    deviceName: text('device_name'),
    userAgent: text('user_agent'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('sessions_token_hash_uq').on(t.refreshTokenHash),
    index('sessions_user_idx').on(t.userId),
  ],
);

export const usageQuotas = pgTable(
  'usage_quotas',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    dimension: quotaDimensionEnum('dimension').notNull(),
    /** Billing period key, e.g. 2026-09. */
    period: text('period').notNull(),
    used: integer('used').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('usage_quotas_pk').on(t.userId, t.dimension, t.period)],
);

export const translations = pgTable(
  'translations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    idempotencyKey: uuid('idempotency_key'),
    sourceLanguage: text('source_language').notNull(),
    detectedLanguage: text('detected_language').notNull(),
    targetLanguage: text('target_language').notNull(),
    mode: translationModeEnum('mode').notNull(),
    sourceText: text('source_text').notNull(),
    translatedText: text('translated_text').notNull(),
    /** Alternatives, ambiguities, notes, integrity — structured, non-relational by nature. */
    details: jsonb('details')
      .notNull()
      .default(sql`'{}'::jsonb`),
    favorite: boolean('favorite').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('translations_user_created_idx').on(t.userId, t.createdAt),
    uniqueIndex('translations_user_idem_uq').on(t.userId, t.idempotencyKey),
  ],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    correlationId: text('correlation_id').notNull(),
    feature: text('feature').notNull(),
    slot: text('slot').notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    unit: text('unit').notNull(),
    inputUnits: integer('input_units').notNull(),
    outputUnits: integer('output_units').notNull(),
    latencyMs: integer('latency_ms').notNull(),
    success: boolean('success').notNull(),
    retries: integer('retries').notNull().default(0),
    fallbackFrom: text('fallback_from'),
    errorCode: text('error_code'),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ai_usage_created_idx').on(t.createdAt), index('ai_usage_user_idx').on(t.userId)],
);

export const realtimeSessions = pgTable(
  'realtime_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: realtimeKindEnum('kind').notNull(),
    tier: realtimeTierEnum('tier').notNull(),
    myLanguage: text('my_language').notNull(),
    targetLanguage: text('target_language').notNull(),
    remoteLanguage: text('remote_language'),
    recording: boolean('recording').notNull().default(false),
    degraded: boolean('degraded').notNull().default(false),
    degradedReason: text('degraded_reason'),
    metrics: jsonb('metrics'),
    durationSeconds: integer('duration_seconds'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (t) => [index('realtime_sessions_user_idx').on(t.userId, t.startedAt)],
);

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  description: text('description'),
  updatedBy: uuid('updated_by'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    correlationId: text('correlation_id'),
    ip: text('ip'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_events_created_idx').on(t.createdAt),
    index('audit_events_actor_idx').on(t.actorUserId),
  ],
);
