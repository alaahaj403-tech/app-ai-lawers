import { z } from 'zod';
import { languageCodeSchema, sourceLanguageSchema } from './common.js';

/**
 * Realtime session bootstrap. The client asks the server for an ephemeral
 * credential scoped to one session; the server never hands out its own key.
 */
export const realtimeSessionKind = z.enum([
  'face_to_face', // Mode A
  'interpreter_call', // Mode B
  'live_recording',
  'live_meeting',
  'live_subtitles',
]);

export const createRealtimeSessionSchema = z.object({
  kind: realtimeSessionKind,
  /** Language the local participant speaks. 'auto' is allowed for single-mic modes. */
  myLanguage: sourceLanguageSchema,
  /** Language the local participant wants to hear/read. */
  targetLanguage: languageCodeSchema,
  /** For bidirectional calls: the remote participant's language (never auto). */
  remoteLanguage: languageCodeSchema.optional(),
  /** Whether audio is persisted. Requires the explicit recording workflow client-side. */
  recording: z.boolean().default(false),
  transport: z.enum(['webrtc', 'websocket']).default('webrtc'),
  /**
   * Clients that cannot run a direct WebRTC session (no media stack, or a
   * policy that requires the media path to be metered) ask for the relay.
   * The server never upgrades a client above what its plan allows.
   */
  preferredTier: z.enum(['tier1_s2s', 'tier2_streaming']).optional(),
});
export type CreateRealtimeSession = z.infer<typeof createRealtimeSessionSchema>;

export const realtimeTier = z.enum(['tier1_s2s', 'tier2_streaming', 'tier3_chunked']);
export type RealtimeTierName = z.infer<typeof realtimeTier>;

export const realtimeSessionResponseSchema = z.object({
  sessionId: z.string(),
  tier: realtimeTier,
  /**
   * Tier 1 only: a short-lived provider credential for a direct device
   * connection. Its lifetime is capped by the account's remaining minutes.
   */
  clientSecret: z.object({ value: z.string(), expiresAt: z.string() }).nullable(),
  /** Tier 1 only: the provider endpoint to connect to. */
  endpoint: z.url().nullable(),
  /**
   * Tier 2 only: our relay. The client streams audio here and the server holds
   * the provider connection, so minutes are metered from the media path.
   */
  relay: z.object({ path: z.string(), ticket: z.string(), expiresAt: z.string() }).nullable(),
  /** Whether the returned tier is a fallback from the preferred one. */
  degraded: z.boolean(),
  degradedReason: z.string().optional(),
  quota: z.object({
    dimension: z.literal('realtime_minutes'),
    used: z.number(),
    limit: z.number().nullable(),
  }),
});
export type RealtimeSessionResponse = z.infer<typeof realtimeSessionResponseSchema>;

/** Client reports measured latency + segments so the server can persist + learn. */
export const realtimeMetricsReportSchema = z.object({
  sessionId: z.string(),
  connectionSetupMs: z.number().int().nonnegative().optional(),
  firstTranscriptMs: z.number().int().nonnegative().optional(),
  firstTranslationMs: z.number().int().nonnegative().optional(),
  firstAudioMs: z.number().int().nonnegative().optional(),
  reconnects: z.number().int().nonnegative().default(0),
  durationSeconds: z.number().int().nonnegative(),
});

/**
 * Relay protocol (Tier 2). The client streams PCM16 audio to our server over a
 * WebSocket and receives captions, translations and translated audio back.
 * Holding the provider connection server-side is what lets realtime minutes be
 * metered from the media path instead of a client-reported duration.
 *
 * Binary frames from the client are raw little-endian PCM16 mono at
 * `RELAY_SAMPLE_RATE`. Binary frames from the server are audio payloads, each
 * announced by the preceding `audio_begin` message.
 *
 * Clients should begin streaming once `ready` arrives. Audio sent earlier is
 * buffered by the server, but `ready` is also when quota state is first known.
 */
export const RELAY_SAMPLE_RATE = 24_000;

export const relayClientMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stop') }),
  /** Barge-in: stop any translated audio currently playing. */
  z.object({ type: z.literal('interrupt') }),
  /** Resume after a reconnect: the server replays only newer segments. */
  z.object({ type: z.literal('resume'), lastSegmentId: z.string().max(64).nullable() }),
]);
export type RelayClientMessage = z.infer<typeof relayClientMessageSchema>;

export const relayServerMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ready'),
    sessionId: z.string(),
    tier: realtimeTier,
    sampleRate: z.literal(RELAY_SAMPLE_RATE),
    speakTranslations: z.boolean(),
  }),
  /** Unstable text still being spoken; replaces the previous pending caption. */
  z.object({ type: z.literal('partial'), text: z.string() }),
  /** A confirmed original segment. Never rewritten by a later translation. */
  z.object({
    type: z.literal('segment'),
    segmentId: z.string(),
    original: z.string(),
    sourceLanguage: z.string(),
  }),
  z.object({ type: z.literal('translation'), segmentId: z.string(), text: z.string() }),
  z.object({
    type: z.literal('audio_begin'),
    segmentId: z.string(),
    mimeType: z.string(),
    byteLength: z.number().int().positive(),
  }),
  z.object({
    type: z.literal('quota'),
    usedMinutes: z.number().int().nonnegative(),
    limitMinutes: z.number().int().nonnegative().nullable(),
  }),
  z.object({
    type: z.literal('error'),
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
  }),
  z.object({
    type: z.literal('closed'),
    reason: z.string(),
    durationSeconds: z.number().int().nonnegative(),
  }),
]);
export type RelayServerMessage = z.infer<typeof relayServerMessageSchema>;
