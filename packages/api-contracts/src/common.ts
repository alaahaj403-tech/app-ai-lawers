import { z } from 'zod';
import { TRANSLATION_MODES, isSupportedLanguage } from '@voxeli/domain';

export const languageCodeSchema = z
  .string()
  .min(2)
  .max(10)
  .refine(isSupportedLanguage, { message: 'Unsupported language code' });

export const sourceLanguageSchema = z.union([z.literal('auto'), languageCodeSchema]);

export const translationModeSchema = z.enum(TRANSLATION_MODES);

export const uuidSchema = z.uuid();

export const paginationQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    correlationId: z.string().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
