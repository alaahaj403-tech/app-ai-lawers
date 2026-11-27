import { z } from 'zod';
import { languageCodeSchema } from './common.js';

/** Provider limit for a single synthesis request. */
export const MAX_SPEECH_CHARS = 4_000;

export const speechFormatSchema = z.enum(['mp3', 'wav', 'opus', 'pcm']);
export type SpeechFormat = z.infer<typeof speechFormatSchema>;

export const speechRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_SPEECH_CHARS),
  language: languageCodeSchema,
  format: speechFormatSchema.default('mp3'),
  /** Optional voice name; unknown values fall back to the server default. */
  voice: z.string().trim().max(40).optional(),
});
export type SpeechRequest = z.infer<typeof speechRequestSchema>;
