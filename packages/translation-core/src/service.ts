import type { AIModelRouter, CallContext, RoutedTranslation } from '@voxeli/ai-core';
import { failures, getLanguage } from '@voxeli/domain';
import type { Plan, TranslationRequest, TranslationResult } from '@voxeli/domain';
import { buildTranslationPrompt } from './prompt.js';
import { extractProtectedEntities, verifyIntegrity } from './protected-entities.js';
import { detectScriptLeaks } from './script-leaks.js';

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
  /**
   * True when a second pass was needed — and helped — after the first output
   * corrupted a protected entity or left words in the source script.
   */
  readonly repaired: boolean;
  /** Source-script words still present in the returned text. Empty when clean. */
  readonly scriptLeaks: readonly string[];
}

/**
 * TranslationService — the application-level translation use case.
 *
 * Flow: extract protected entities → build structured prompt → route via
 * AIModelRouter → verify integrity and source-script leakage → (one repair pass
 * if either is violated) → result.
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

    const first = await this.run(req, entities, opts, ctx, feature, undefined, undefined);
    let routed = first;
    let integrity = verifyIntegrity(entities, routed.output.translatedText);

    // With sourceLanguage 'auto' the script is unknown until the model reports
    // what it detected; that report is only used to choose which script to scan
    // for, so a wrong value weakens the check rather than corrupting output.
    const sourceForScript =
      req.sourceLanguage === 'auto' ? first.output.detectedLanguage : req.sourceLanguage;
    const leaksOf = (text: string): string[] =>
      detectScriptLeaks(text, {
        sourceLanguage: sourceForScript,
        targetLanguage: req.targetLanguage,
      });

    let scriptLeaks = leaksOf(routed.output.translatedText);
    let repaired = false;

    if (integrity.violations.length > 0 || scriptLeaks.length > 0) {
      const second = await this.run(
        req,
        entities,
        opts,
        ctx,
        `${feature}.repair`,
        integrity.violations,
        scriptLeaks,
      );
      const secondIntegrity = verifyIntegrity(entities, second.output.translatedText);
      const secondLeaks = leaksOf(second.output.translatedText);
      // Take the retry only if it is strictly better overall and worse on
      // neither axis — trading a corrupted number for a clean script is a loss.
      const before = integrity.violations.length + scriptLeaks.length;
      const after = secondIntegrity.violations.length + secondLeaks.length;
      if (
        after < before &&
        secondIntegrity.violations.length <= integrity.violations.length &&
        secondLeaks.length <= scriptLeaks.length
      ) {
        routed = second;
        integrity = secondIntegrity;
        scriptLeaks = secondLeaks;
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
      scriptLeaks,
    };
  }

  private run(
    req: TranslationRequest,
    entities: ReturnType<typeof extractProtectedEntities>,
    opts: TranslateOptions,
    ctx: CallContext,
    feature: string,
    repairViolations: readonly string[] | undefined,
    repairScriptLeaks: readonly string[] | undefined,
  ) {
    const prompt = buildTranslationPrompt(req, entities, {
      ...(repairViolations && repairViolations.length > 0 ? { repairViolations } : {}),
      ...(repairScriptLeaks && repairScriptLeaks.length > 0 ? { repairScriptLeaks } : {}),
    });
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
