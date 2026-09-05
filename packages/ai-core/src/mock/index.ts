import type {
  CallContext,
  ProviderTranslationInput,
  ProviderTranslationOutput,
  RealtimeClientSecret,
  RealtimeClientSecretRequest,
  RealtimeTier,
  RealtimeTranslationProvider,
  TranslationProvider,
} from '../types.js';

export interface MockBehaviour {
  /** Throw this error on every call (tests failover). */
  failWith?: () => Error;
  /** Corrupt digits in output to exercise integrity checks. */
  corruptNumbers?: boolean;
  latencyMs?: number;
}

/**
 * Deterministic provider for local development and tests. Output is clearly
 * marked as mock so nobody mistakes it for a translation.
 */
export class MockTranslationProvider implements TranslationProvider {
  readonly id = 'mock' as const;
  calls = 0;
  constructor(private readonly behaviour: MockBehaviour = {}) {}

  async translate(
    _model: string,
    input: ProviderTranslationInput,
    _ctx: CallContext,
  ): Promise<ProviderTranslationOutput> {
    this.calls += 1;
    if (this.behaviour.latencyMs) await new Promise((r) => setTimeout(r, this.behaviour.latencyMs));
    if (this.behaviour.failWith) throw this.behaviour.failWith();
    const source = extractPayload(input.userContent);
    let translatedText = `[${input.targetLanguage}] ${source}`;
    if (this.behaviour.corruptNumbers)
      translatedText = translatedText.replace(/\d/g, (d) => String((Number(d) + 1) % 10));
    return {
      detectedLanguage: input.sourceLanguage === 'auto' ? 'en' : input.sourceLanguage,
      translatedText,
      alternatives: [],
      ambiguities: [],
      register: 'neutral',
      notes: ['Development translation — not a real translation.'],
      usage: {
        inputTokens: Math.ceil(input.userContent.length / 4),
        outputTokens: Math.ceil(translatedText.length / 4),
      },
    };
  }
}

/** The translation-core prompt wraps the text in <source_text> tags; mirror that here. */
function extractPayload(userContent: string): string {
  const m = /<source_text>\n?([\s\S]*?)\n?<\/source_text>/.exec(userContent);
  return m?.[1] ?? userContent;
}

export class MockRealtimeProvider implements RealtimeTranslationProvider {
  readonly id = 'mock' as const;
  constructor(private readonly tiers: readonly RealtimeTier[] = ['tier1_s2s', 'tier2_streaming']) {}
  supportedTiers(): readonly RealtimeTier[] {
    return this.tiers;
  }
  createClientSecret(req: RealtimeClientSecretRequest): Promise<RealtimeClientSecret> {
    return Promise.resolve({
      value: `ek_mock_${req.tier}`,
      expiresAt: new Date(Date.now() + req.expiresInSeconds * 1000),
      endpoint: 'https://mock.invalid/realtime',
    });
  }
}
