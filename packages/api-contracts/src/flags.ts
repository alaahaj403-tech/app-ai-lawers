import { z } from 'zod';

export const FEATURE_FLAGS = [
  'caller_id_android',
  'caller_id_ios',
  'call_recording',
  'voip',
  'live_translation',
  'web_context',
  'accessibility_translation',
  'experimental_ai_tutor',
  'document_translation',
] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAGS)[number];
export const featureFlagKeySchema = z.enum(FEATURE_FLAGS);

export const featureFlagsResponseSchema = z.object({
  flags: z.record(featureFlagKeySchema, z.boolean()),
  /** Echoed so clients can cache safely. */
  fetchedAt: z.string(),
});
export type FeatureFlagsResponse = z.infer<typeof featureFlagsResponseSchema>;
