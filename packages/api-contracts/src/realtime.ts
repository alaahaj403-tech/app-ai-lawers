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
});
export type CreateRealtimeSession = z.infer<typeof createRealtimeSessionSchema>;

export const realtimeTier = z.enum(['tier1_s2s', 'tier2_streaming', 'tier3_chunked']);

export const realtimeSessionResponseSchema = z.object({
  sessionId: z.string(),
  tier: realtimeTier,
  /** Short-lived client secret for the provider realtime endpoint. */
  clientSecret: z.object({ value: z.string(), expiresAt: z.string() }),
  /** Provider endpoint the client should connect to for this tier/transport. */
  endpoint: z.url(),
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
