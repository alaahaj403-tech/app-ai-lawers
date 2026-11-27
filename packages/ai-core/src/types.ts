import type { ModelSlot } from '@voxeli/config';
import type { TranslationMode } from '@voxeli/domain';

export type ProviderId = 'openai' | 'mock';

/** Input to a translation provider. Prompt assembly happens in translation-core; providers only transport. */
export interface ProviderTranslationInput {
  /** Policy/instructions authored by us. */
  readonly instructions: string;
  /** The untrusted payload, already wrapped as data by the caller. */
  readonly userContent: string;
  readonly sourceLanguage: string; // 'auto' allowed
  readonly targetLanguage: string;
  readonly mode: TranslationMode;
  readonly maxOutputTokens?: number;
}

export interface ProviderTranslationOutput {
  readonly detectedLanguage: string;
  readonly translatedText: string;
  readonly alternatives: readonly { text: string; note?: string }[];
  readonly ambiguities: readonly { span: string; explanation: string }[];
  readonly register: 'formal' | 'neutral' | 'informal' | 'unknown';
  readonly dialect?: string;
  readonly notes: readonly string[];
  readonly usage: TokenUsage;
}

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface CallContext {
  readonly correlationId: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

export interface TranslationProvider {
  readonly id: ProviderId;
  translate(
    model: string,
    input: ProviderTranslationInput,
    ctx: CallContext,
  ): Promise<ProviderTranslationOutput>;
}

export interface SpeechToTextProvider {
  readonly id: ProviderId;
  transcribe(
    model: string,
    audio: { data: Uint8Array; mimeType: string; languageHint?: string },
    ctx: CallContext,
  ): Promise<{ text: string; language?: string; durationSeconds?: number }>;
}

export interface TextToSpeechProvider {
  readonly id: ProviderId;
  synthesize(
    model: string,
    input: {
      text: string;
      language: string;
      voice?: string;
      format: 'mp3' | 'wav' | 'pcm' | 'opus';
    },
    ctx: CallContext,
  ): Promise<{ audio: Uint8Array; mimeType: string }>;
}

export type RealtimeTier = 'tier1_s2s' | 'tier2_streaming' | 'tier3_chunked';

export interface RealtimeClientSecretRequest {
  readonly tier: Exclude<RealtimeTier, 'tier3_chunked'>;
  readonly model: string;
  readonly transport: 'webrtc' | 'websocket';
  /** Target language for tier-1 speech-to-speech translation. */
  readonly targetLanguage?: string;
  /** Source-language hints for tier-2 live transcription. */
  readonly languageHints?: readonly string[];
  readonly expiresInSeconds: number;
}

export interface RealtimeClientSecret {
  readonly value: string;
  readonly expiresAt: Date;
  /** Endpoint the client connects to with this secret. */
  readonly endpoint: string;
}

export interface RealtimeTranslationProvider {
  readonly id: ProviderId;
  /** Tiers this provider can serve for a given target language. Order = preference. */
  supportedTiers(targetLanguage: string): readonly RealtimeTier[];
  createClientSecret(
    req: RealtimeClientSecretRequest,
    ctx: CallContext,
  ): Promise<RealtimeClientSecret>;
}

export interface AIUsageRecord {
  readonly correlationId: string;
  readonly feature: string;
  readonly slot: ModelSlot;
  readonly provider: ProviderId;
  readonly model: string;
  readonly inputUnits: number;
  readonly outputUnits: number;
  readonly unit: 'tokens' | 'audio_seconds' | 'characters';
  readonly latencyMs: number;
  readonly success: boolean;
  readonly retries: number;
  readonly fallbackFrom?: string;
  readonly estimatedCostUsd: number | null;
  readonly errorCode?: string;
}

export interface UsageRecorder {
  record(record: AIUsageRecord): Promise<void> | void;
}

export interface ProviderHealthSnapshot {
  readonly provider: ProviderId;
  readonly model: string;
  readonly consecutiveFailures: number;
  readonly openUntil: number | null;
}
