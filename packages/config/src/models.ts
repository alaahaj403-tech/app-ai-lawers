/**
 * Server-controlled model configuration. The mobile/web clients never see or
 * choose model IDs; they request a *capability* and the router resolves it.
 *
 * Model IDs below were verified against the official OpenAI documentation on
 * 2026-09-04 (see docs/ADR/0004-ai-provider-routing.md). Override any of them
 * with environment variables or the admin console without a client release.
 */
export type ModelSlot =
  | 'translation.default'
  | 'translation.fast'
  | 'translation.highQuality'
  | 'speech.transcription'
  | 'speech.transcription.live'
  | 'speech.synthesis'
  | 'realtime.conversation'
  | 'realtime.translation'
  | 'vision.default'
  | 'reasoning.default'
  | 'embedding.default';

export interface ModelRef {
  readonly provider: 'openai' | 'mock';
  readonly model: string;
  /** USD per 1M input tokens (text) — used ONLY for cost estimation, not billing. */
  readonly inputUsdPerMillion?: number;
  readonly outputUsdPerMillion?: number;
  /** USD per minute of audio, where the unit is audio. */
  readonly audioUsdPerMinute?: number;
}

export type ModelConfig = Readonly<Record<ModelSlot, ModelRef>>;

/**
 * Defaults. Prices are intentionally omitted where not verified; the cost
 * estimator reports `estimated: false` for those. Fill via admin config.
 */
export const DEFAULT_MODEL_CONFIG: ModelConfig = {
  'translation.default': { provider: 'openai', model: 'gpt-5.6-terra' },
  'translation.fast': { provider: 'openai', model: 'gpt-5.6-luna' },
  'translation.highQuality': { provider: 'openai', model: 'gpt-5.6-sol' },
  'speech.transcription': { provider: 'openai', model: 'gpt-transcribe' },
  'speech.transcription.live': { provider: 'openai', model: 'gpt-live-transcribe' },
  'speech.synthesis': { provider: 'openai', model: 'gpt-4o-mini-tts' },
  'realtime.conversation': { provider: 'openai', model: 'gpt-realtime-2.1-mini' },
  'realtime.translation': { provider: 'openai', model: 'gpt-realtime-translate' },
  'vision.default': { provider: 'openai', model: 'gpt-5.6-terra' },
  'reasoning.default': { provider: 'openai', model: 'gpt-5.6-sol' },
  'embedding.default': { provider: 'openai', model: 'text-embedding-3-small' },
};

const SLOT_ENV_PREFIX = 'VOXELI_MODEL_';

/**
 * Apply environment overrides of the form VOXELI_MODEL_TRANSLATION_DEFAULT=provider:model
 * (provider optional, defaults to the slot's provider).
 */
export function resolveModelConfig(
  env: NodeJS.ProcessEnv,
  base: ModelConfig = DEFAULT_MODEL_CONFIG,
): ModelConfig {
  const out: Record<ModelSlot, ModelRef> = { ...base };
  for (const slot of Object.keys(base) as ModelSlot[]) {
    const key = SLOT_ENV_PREFIX + slot.replace(/\./g, '_').toUpperCase();
    const value = env[key];
    if (!value) continue;
    const [maybeProvider, maybeModel] = value.includes(':')
      ? value.split(':', 2)
      : [undefined, value];
    const provider =
      maybeProvider === 'openai' || maybeProvider === 'mock' ? maybeProvider : base[slot].provider;
    const model = (maybeModel ?? value).trim();
    if (model.length > 0) out[slot] = { ...base[slot], provider, model };
  }
  return out;
}
