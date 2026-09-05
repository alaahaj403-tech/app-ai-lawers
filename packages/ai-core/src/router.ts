import type { ModelConfig, ModelRef, ModelSlot } from '@voxeli/config';
import { AppFailure, failures } from '@voxeli/domain';
import type { Plan } from '@voxeli/domain';
import { estimateTextCost } from './cost.js';
import { ProviderHealth } from './health.js';
import type {
  CallContext,
  ProviderId,
  ProviderTranslationInput,
  ProviderTranslationOutput,
  RealtimeTier,
  RealtimeTranslationProvider,
  TranslationProvider,
  UsageRecorder,
} from './types.js';

export interface RouterProviders {
  readonly translation: Partial<Record<ProviderId, TranslationProvider>>;
  readonly realtime: Partial<Record<ProviderId, RealtimeTranslationProvider>>;
}

export interface TranslationRoutingRequest {
  readonly input: ProviderTranslationInput;
  readonly plan: Plan;
  /** Caller's quality preference. Plan may cap it. */
  readonly quality: 'fast' | 'default' | 'high';
  readonly feature: string;
}

export interface RoutedTranslation {
  readonly output: ProviderTranslationOutput;
  readonly slot: ModelSlot;
  readonly provider: ProviderId;
  readonly model: string;
  readonly degraded: boolean;
  readonly latencyMs: number;
  readonly attempts: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;

/**
 * AIModelRouter — the single place where capability requests become
 * provider/model choices. Application code asks for a slot; this class
 * decides, fails over, records usage, and explains its decision.
 */
export class AIModelRouter {
  private readonly health: ProviderHealth;

  constructor(
    private readonly config: ModelConfig,
    private readonly providers: RouterProviders,
    private readonly usage: UsageRecorder,
    options: { health?: ProviderHealth } = {},
  ) {
    this.health = options.health ?? new ProviderHealth();
  }

  /** Ordered candidate slots for a translation request. First = preferred. */
  translationCandidates(plan: Plan, quality: TranslationRoutingRequest['quality']): ModelSlot[] {
    const wantsHigh = quality === 'high' && plan !== 'free';
    if (wantsHigh) return ['translation.highQuality', 'translation.default', 'translation.fast'];
    if (quality === 'fast') return ['translation.fast', 'translation.default'];
    return ['translation.default', 'translation.fast'];
  }

  async translate(req: TranslationRoutingRequest, ctx: CallContext): Promise<RoutedTranslation> {
    const candidates = this.translationCandidates(req.plan, req.quality);
    let attempts = 0;
    let lastError: unknown;
    let fallbackFrom: string | undefined;

    for (const slot of candidates) {
      const ref = this.config[slot];
      const provider = this.providers.translation[ref.provider];
      if (!provider) continue;
      if (!this.health.isAvailable(ref.provider, ref.model)) {
        fallbackFrom ??= `${slot}:circuit_open`;
        continue;
      }
      attempts += 1;
      const started = Date.now();
      try {
        const output = await withTimeout(
          provider.translate(ref.model, req.input, ctx),
          ctx.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          ctx.signal,
        );
        const latencyMs = Date.now() - started;
        this.health.recordSuccess(ref.provider, ref.model);
        await this.record(
          ctx,
          req.feature,
          slot,
          ref,
          output.usage.inputTokens,
          output.usage.outputTokens,
          latencyMs,
          true,
          attempts - 1,
          fallbackFrom,
        );
        return {
          output,
          slot,
          provider: ref.provider,
          model: ref.model,
          degraded: slot !== candidates[0],
          latencyMs,
          attempts,
        };
      } catch (error) {
        const latencyMs = Date.now() - started;
        lastError = error;
        const failure = AppFailure.from(error, 'PROVIDER_UNAVAILABLE');
        this.health.recordFailure(ref.provider, ref.model);
        await this.record(
          ctx,
          req.feature,
          slot,
          ref,
          0,
          0,
          latencyMs,
          false,
          attempts - 1,
          fallbackFrom,
          failure.code,
        );
        // Validation-type failures (bad output shape, integrity) are not fixed by switching model blindly,
        // but a different model may well produce valid output — continue. Abort only on caller cancellation.
        if (ctx.signal?.aborted) throw failure;
        fallbackFrom ??= `${slot}:${failure.code}`;
      }
    }
    throw lastError instanceof AppFailure
      ? lastError
      : failures.providerUnavailable('Translation is temporarily unavailable', {
          cause: lastError,
        });
  }

  /**
   * Realtime tier selection. Tier 1 requires the provider to support the target
   * language for direct speech-to-speech; plan gates Tier 1 as a premium path.
   */
  selectRealtimeTier(opts: { plan: Plan; targetLanguage: string; tier1Allowed: boolean }): {
    tier: RealtimeTier;
    slot: ModelSlot;
    provider: RealtimeTranslationProvider;
    ref: ModelRef;
    degradedReason?: string;
  } {
    const s2sRef = this.config['realtime.translation'];
    const liveRef = this.config['speech.transcription.live'];
    const provider =
      this.providers.realtime[s2sRef.provider] ?? this.providers.realtime[liveRef.provider];
    if (!provider) throw failures.providerUnavailable('Realtime translation is not configured');

    const supported = provider.supportedTiers(opts.targetLanguage);
    const tier1Healthy = this.health.isAvailable(s2sRef.provider, s2sRef.model);
    if (opts.tier1Allowed && supported.includes('tier1_s2s') && tier1Healthy) {
      return { tier: 'tier1_s2s', slot: 'realtime.translation', provider, ref: s2sRef };
    }
    if (supported.includes('tier2_streaming')) {
      const degradedReason = !opts.tier1Allowed
        ? 'plan_does_not_include_tier1'
        : !supported.includes('tier1_s2s')
          ? 'tier1_unsupported_for_language'
          : 'tier1_circuit_open';
      return {
        tier: 'tier2_streaming',
        slot: 'speech.transcription.live',
        provider,
        ref: liveRef,
        degradedReason,
      };
    }
    throw failures.modelUnsupported('No realtime tier available for this language');
  }

  healthSnapshot() {
    return this.health.snapshot();
  }

  private async record(
    ctx: CallContext,
    feature: string,
    slot: ModelSlot,
    ref: ModelRef,
    inputUnits: number,
    outputUnits: number,
    latencyMs: number,
    success: boolean,
    retries: number,
    fallbackFrom: string | undefined,
    errorCode?: string,
  ) {
    const cost = estimateTextCost(ref, inputUnits, outputUnits);
    await this.usage.record({
      correlationId: ctx.correlationId,
      feature,
      slot,
      provider: ref.provider,
      model: ref.model,
      inputUnits,
      outputUnits,
      unit: 'tokens',
      latencyMs,
      success,
      retries,
      ...(fallbackFrom ? { fallbackFrom } : {}),
      estimatedCostUsd: cost.usd,
      ...(errorCode ? { errorCode } : {}),
    });
  }
}

export async function withTimeout<T>(p: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(failures.timeout());
    }, ms);
    signal?.addEventListener(
      'abort',
      () => {
        reject(failures.network('Cancelled'));
      },
      { once: true },
    );
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
