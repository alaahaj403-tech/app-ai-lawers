import { failures, isSupportedLanguage } from '@voxeli/domain';
import type {
  CallContext,
  RealtimeClientSecret,
  RealtimeClientSecretRequest,
  RealtimeTier,
  RealtimeTranslationProvider,
} from '../types.js';

/**
 * OpenAI Realtime adapter. Endpoints verified against the official docs on 2026-09-04:
 *  - POST /v1/realtime/client_secrets                 (realtime + transcription sessions)
 *  - POST /v1/realtime/translations/client_secrets    (speech-to-speech translation sessions)
 *  - WebRTC  https://api.openai.com/v1/realtime/translations/calls
 *  - WS      wss://api.openai.com/v1/realtime/translations?model=gpt-realtime-translate
 * Only ephemeral secrets ever reach a client. The API key stays on the server.
 */
const BASE = 'https://api.openai.com/v1';

export class OpenAIRealtimeProvider implements RealtimeTranslationProvider {
  readonly id = 'openai' as const;
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  supportedTiers(targetLanguage: string): readonly RealtimeTier[] {
    // The provider docs do not enumerate the full target-language list for
    // speech-to-speech translation. We advertise Tier 1 only for languages in
    // our registry and rely on the runtime capability probe (ADR-0004) to narrow.
    return isSupportedLanguage(targetLanguage)
      ? ['tier1_s2s', 'tier2_streaming']
      : ['tier2_streaming'];
  }

  async createClientSecret(
    req: RealtimeClientSecretRequest,
    ctx: CallContext,
  ): Promise<RealtimeClientSecret> {
    const expires_after = { anchor: 'created_at', seconds: clamp(req.expiresInSeconds, 10, 7200) };
    let url: string;
    let body: Record<string, unknown>;
    let endpoint: string;

    if (req.tier === 'tier1_s2s') {
      if (!req.targetLanguage)
        throw failures.validation('targetLanguage is required for speech-to-speech');
      url = `${BASE}/realtime/translations/client_secrets`;
      body = {
        expires_after,
        session: { model: req.model, audio: { output: { language: req.targetLanguage } } },
      };
      endpoint =
        req.transport === 'webrtc'
          ? `${BASE}/realtime/translations/calls`
          : `wss://api.openai.com/v1/realtime/translations?model=${encodeURIComponent(req.model)}`;
    } else {
      url = `${BASE}/realtime/client_secrets`;
      body = {
        expires_after,
        session: {
          type: 'transcription',
          audio: {
            input: {
              format: { type: 'audio/pcm', rate: 24000 },
              transcription: {
                model: req.model,
                ...(req.languageHints?.length ? { languages: req.languageHints } : {}),
              },
              noise_reduction: { type: 'near_field' },
            },
          },
        },
      };
      endpoint =
        req.transport === 'webrtc' ? `${BASE}/realtime/calls` : `wss://api.openai.com/v1/realtime`;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, ctx.timeoutMs ?? 10_000);
    ctx.signal?.addEventListener(
      'abort',
      () => {
        controller.abort();
      },
      { once: true },
    );
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'x-correlation-id': ctx.correlationId,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const status = res.status;
        if (status === 401 || status === 403)
          throw failures.internal('AI provider credential rejected');
        if (status === 429 || status >= 500)
          throw failures.providerUnavailable('Realtime provider unavailable', {
            details: { status },
          });
        throw failures.modelUnsupported('Realtime session request rejected');
      }
      const json = (await res.json()) as { value?: unknown; expires_at?: unknown };
      if (typeof json.value !== 'string' || typeof json.expires_at !== 'number') {
        throw failures.providerUnavailable('Malformed realtime credential response');
      }
      return { value: json.value, expiresAt: new Date(json.expires_at * 1000), endpoint };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError')
        throw failures.timeout('Realtime credential request timed out');
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(n)));
}
