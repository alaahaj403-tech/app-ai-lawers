import { z } from 'zod';
import { languageCodeSchema, sourceLanguageSchema, translationModeSchema } from './common.js';

/** Hard cap protects cost and abuse; documents use a separate pipeline. */
export const MAX_TRANSLATION_CHARS = 5_000;

export const translateRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TRANSLATION_CHARS),
  sourceLanguage: sourceLanguageSchema.default('auto'),
  targetLanguage: languageCodeSchema,
  mode: translationModeSchema.default('natural'),
  context: z.string().trim().max(1_000).optional(),
  glossary: z
    .array(
      z.object({
        source: z.string().trim().min(1).max(100),
        target: z.string().trim().min(1).max(100),
      }),
    )
    .max(50)
    .optional(),
  /** Client-generated idempotency key for safe retries. */
  idempotencyKey: z.uuid().optional(),
  /** When false, nothing is persisted (no-history mode). */
  saveToHistory: z.boolean().default(true),
});
export type TranslateRequest = z.infer<typeof translateRequestSchema>;

export const translationResultSchema = z.object({
  detectedLanguage: z.string(),
  targetLanguage: z.string(),
  translatedText: z.string(),
  alternatives: z.array(z.object({ text: z.string(), note: z.string().optional() })),
  ambiguities: z.array(z.object({ span: z.string(), explanation: z.string() })),
  register: z.enum(['formal', 'neutral', 'informal', 'unknown']),
  dialect: z.string().optional(),
  notes: z.array(z.string()),
  integrity: z.object({
    protectedEntities: z.number().int().nonnegative(),
    preservedEntities: z.number().int().nonnegative(),
    violations: z.array(z.string()),
  }),
});

export const translateResponseSchema = z.object({
  id: z.string().nullable(),
  result: translationResultSchema,
  routing: z.object({
    /** Which capability slot answered. Provider/model names stay server-side. */
    slot: z.string(),
    degraded: z.boolean(),
    latencyMs: z.number().int().nonnegative(),
  }),
  quota: z.object({
    dimension: z.literal('translations'),
    used: z.number().int().nonnegative(),
    limit: z.number().int().nonnegative().nullable(),
  }),
});
export type TranslateResponse = z.infer<typeof translateResponseSchema>;

export const translationHistoryItemSchema = z.object({
  id: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  sourceText: z.string(),
  translatedText: z.string(),
  mode: translationModeSchema,
  favorite: z.boolean(),
  createdAt: z.string(),
});
export const translationHistoryPageSchema = z.object({
  items: z.array(translationHistoryItemSchema),
  nextCursor: z.string().nullable(),
});
export type TranslationHistoryItem = z.infer<typeof translationHistoryItemSchema>;
export type TranslationHistoryPage = z.infer<typeof translationHistoryPageSchema>;

export const updateTranslationSchema = z.object({ favorite: z.boolean().optional() }).strict();
