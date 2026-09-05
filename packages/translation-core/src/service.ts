import type { AIModelRouter, CallContext, RoutedTranslation } from '@voxeli/ai-core';
import { failures, getLanguage } from '@voxeli/domain';
import type { Plan, TranslationRequest, TranslationResult } from '@voxeli/domain';
import { buildTranslationPrompt } from './prompt.js';
import { extractProtectedEntities, verifyIntegrity } from './protected-entities.js';

export interface TranslateOptions {
  readonly plan: Plan;
  readonly quality: 'fast' | 'default' | 'high';
  readonly feature?: string;
}

export interface TranslationOutcome {
  readonly result: TranslationResult;
  readonly routing: Pick<
    RoutedTranslation,
    'slot' | 'provider' | 'model' | 'degraded' | 'latencyMs' | 'attempts'
  >;
  /** True when a second pass was needed to repair entity corruption. */
  readonly repaired: boolean;
}

/**
 * TranslationService — the application-level translation use case.
 *
 * Flow: extract protected entities → build structured prompt → route via
 * AIModelRouter → verify integrity → (one repair pass if violated) → result.
 * Provider-specific structures never leave this layer.
 */
export class TranslationService {
  constructor(private readonly router: AIModelRouter) {}

  async translate(
    req: TranslationRequest,
    opts: TranslateOptions,
    ctx: CallContext,
  ): Promise<TranslationOutcome> {
    if (!getLanguage(req.targetLanguage)) throw failures.validation('Unsupported target language');
    const entities = extractProtectedEntities(req.text);
    const feature = opts.feature ?? 'translate.text';

    const first = await this.run(req, entities, opts, ctx, feature, undefined);
    let routed = first;
    let integrity = verifyIntegrity(entities, routed.output.translatedText);
    let repaired = false;

    if (integrity.violations.length > 0) {
      const second = await this.run(
        req,
        entities,
        opts,
        ctx,
        `${feature}.repair`,
        integrity.violations,
      );
      const secondIntegrity = verifyIntegrity(entities, second.output.translatedText);
      if (secondIntegrity.violations.length < integrity.violations.length) {
        routed = second;
        integrity = secondIntegrity;
        repaired = true;
      }
    }

    const detected =
      req.sourceLanguage !== 'auto'
        ? req.sourceLanguage
        : (getLanguage(routed.output.detectedLanguage)?.code ?? routed.output.detectedLanguage);

    const result: TranslationResult = {
      detectedLanguage: detected,
      targetLanguage: req.targetLanguage,
      translatedText: routed.output.translatedText,
      alternatives: routed.output.alternatives,
      ambiguities: routed.output.ambiguities,
      register: routed.output.register,
      ...(routed.output.dialect ? { dialect: routed.output.dialect } : {}),
      notes: routed.output.notes,
      integrity,
    };
    return {
      result,
      routing: {
        slot: routed.slot,
        provider: routed.provider,
        model: routed.model,
        degraded: routed.degraded,
        latencyMs: first.latencyMs + (repaired ? routed.latencyMs : 0),
        attempts: first.attempts + (routed === first ? 0 : routed.attempts),
      },
      repaired,
    };
  }

  private run(
    req: TranslationRequest,
    entities: ReturnType<typeof extractProtectedEntities>,
    opts: TranslateOptions,
    ctx: CallContext,
    feature: string,
    repairViolations: readonly string[] | undefined,
  ) {
    const prompt = buildTranslationPrompt(
      req,
      entities,
      repairViolations ? { repairViolations } : {},
    );
    return this.router.translate(
      {
        input: {
          instructions: prompt.instructions,
          userContent: prompt.userContent,
          sourceLanguage: req.sourceLanguage,
          targetLanguage: req.targetLanguage,
          mode: req.mode,
        },
        plan: opts.plan,
        quality: opts.quality,
        feature,
      },
      ctx,
    );
  }
}
