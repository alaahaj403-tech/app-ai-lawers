import type {
  CallContext,
  TextToSpeechProvider,
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

/**
 * Deterministic silent WAV so local/test playback paths are exercised without
 * a provider. The audio is real (a valid header plus silence), never a claim
 * of synthesized speech.
 */
export class MockTextToSpeechProvider implements TextToSpeechProvider {
  readonly id = 'mock' as const;
  calls = 0;

  synthesize(
    _model: string,
    input: {
      text: string;
      language: string;
      voice?: string;
      format: 'mp3' | 'wav' | 'pcm' | 'opus';
    },
  ): Promise<{ audio: Uint8Array; mimeType: string }> {
    this.calls += 1;
    // ~40 ms of silence per character, capped, at 24 kHz mono 16-bit.
    const samples = Math.min(24_000 * 5, Math.max(2_400, input.text.length * 960));
    const pcm = new Uint8Array(samples * 2);
    if (input.format === 'pcm') {
      return Promise.resolve({ audio: pcm, mimeType: 'audio/L16;rate=24000' });
    }
    return Promise.resolve({ audio: wavWithHeader(pcm), mimeType: 'audio/wav' });
  }
}

function wavWithHeader(pcm: Uint8Array): Uint8Array {
  const out = new Uint8Array(44 + pcm.byteLength);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 24_000, true);
  view.setUint32(28, 24_000 * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  out.set(pcm, 44);
  return out;
}
