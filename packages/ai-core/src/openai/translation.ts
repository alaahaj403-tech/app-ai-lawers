import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { failures } from '@voxeli/domain';
import type {
  CallContext,
  ProviderTranslationInput,
  ProviderTranslationOutput,
  TranslationProvider,
} from '../types.js';

/**
 * Structured output schema requested from the model. Kept deliberately strict:
 * the model cannot add fields, and every field is validated before use.
 */
const outputSchema = z.object({
  detectedLanguage: z.string().describe('BCP-47 primary language code of the source text'),
  translatedText: z.string(),
  alternatives: z.array(z.object({ text: z.string(), note: z.string() })).max(3),
  ambiguities: z.array(z.object({ span: z.string(), explanation: z.string() })).max(5),
  register: z.enum(['formal', 'neutral', 'informal', 'unknown']),
  dialect: z.string(),
  notes: z.array(z.string()).max(5),
});

export class OpenAITranslationProvider implements TranslationProvider {
  readonly id = 'openai' as const;
  constructor(private readonly client: OpenAI) {}

  async translate(
    model: string,
    input: ProviderTranslationInput,
    ctx: CallContext,
  ): Promise<ProviderTranslationOutput> {
    try {
      const response = await this.client.responses.parse(
        {
          model,
          instructions: input.instructions,
          input: [{ role: 'user', content: input.userContent }],
          text: { format: zodTextFormat(outputSchema, 'translation') },
          max_output_tokens: input.maxOutputTokens ?? 2_048,
          store: false,
        },
        { signal: ctx.signal, headers: { 'x-correlation-id': ctx.correlationId } },
      );
      // AI output is untrusted: re-validate the SDK's parsed object against our schema.
      const check = outputSchema.safeParse(response.output_parsed);
      if (!check.success)
        throw failures.providerUnavailable('Malformed structured output from provider');
      const parsed = check.data;
      return {
        detectedLanguage: parsed.detectedLanguage,
        translatedText: parsed.translatedText,
        alternatives: parsed.alternatives.map((a) => (a.note ? a : { text: a.text })),
        ambiguities: parsed.ambiguities,
        register: parsed.register,
        ...(parsed.dialect ? { dialect: parsed.dialect } : {}),
        notes: parsed.notes,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    } catch (error) {
      throw mapOpenAIError(error);
    }
  }
}

export function mapOpenAIError(error: unknown) {
  if (error instanceof OpenAI.APIError) {
    const status: number = typeof error.status === 'number' ? error.status : 0;
    if (status === 401 || status === 403)
      return failures.internal('AI provider credential rejected', { cause: error });
    if (status === 429)
      return failures.providerUnavailable('AI provider is rate limiting', {
        cause: error,
        details: { status },
      });
    if (status >= 500)
      return failures.providerUnavailable('AI provider error', {
        cause: error,
        details: { status },
      });
    if (status === 400 || status === 404)
      return failures.modelUnsupported('AI model request rejected');
    return failures.providerUnavailable('AI provider request failed', {
      cause: error,
      details: { status },
    });
  }
  if (error instanceof Error && error.name === 'AbortError')
    return failures.network('Cancelled', { cause: error });
  return failures.providerUnavailable('AI provider request failed', { cause: error });
}
