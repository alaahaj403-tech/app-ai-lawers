import { describe, expect, it } from 'vitest';
import { OpenAIRealtimeProvider } from './realtime.js';

function fakeFetch(handler: (url: string, init: RequestInit) => { status: number; body: unknown }) {
  const calls: { url: string; body: unknown }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ url: u, body });
    const r = handler(u, init ?? {});
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
  return { fetch: f, calls };
}

describe('OpenAIRealtimeProvider', () => {
  it('requests a translation client secret with the target language and returns the WebRTC endpoint', async () => {
    const ff = fakeFetch(() => ({
      status: 200,
      body: { value: 'ek_1', expires_at: 1_800_000_000 },
    }));
    const p = new OpenAIRealtimeProvider('sk-test', ff.fetch);
    const secret = await p.createClientSecret(
      {
        tier: 'tier1_s2s',
        model: 'gpt-realtime-translate',
        transport: 'webrtc',
        targetLanguage: 'he',
        expiresInSeconds: 300,
      },
      { correlationId: 'c' },
    );
    expect(ff.calls[0]?.url).toBe('https://api.openai.com/v1/realtime/translations/client_secrets');
    expect(ff.calls[0]?.body).toEqual({
      expires_after: { anchor: 'created_at', seconds: 300 },
      session: { model: 'gpt-realtime-translate', audio: { output: { language: 'he' } } },
    });
    expect(secret.value).toBe('ek_1');
    expect(secret.endpoint).toBe('https://api.openai.com/v1/realtime/translations/calls');
  });

  it('requests a transcription session for tier 2', async () => {
    const ff = fakeFetch(() => ({
      status: 200,
      body: { value: 'ek_2', expires_at: 1_800_000_000 },
    }));
    const p = new OpenAIRealtimeProvider('sk-test', ff.fetch);
    const s = await p.createClientSecret(
      {
        tier: 'tier2_streaming',
        model: 'gpt-live-transcribe',
        transport: 'websocket',
        languageHints: ['he', 'en'],
        expiresInSeconds: 99999,
      },
      { correlationId: 'c' },
    );
    expect(ff.calls[0]?.url).toBe('https://api.openai.com/v1/realtime/client_secrets');
    const body = ff.calls[0]?.body as {
      expires_after: { seconds: number };
      session: { type: string };
    };
    expect(body.expires_after.seconds).toBe(7200);
    expect(body.session.type).toBe('transcription');
    expect(s.endpoint).toBe('wss://api.openai.com/v1/realtime');
  });

  it('never leaks the API key into the result and maps 5xx to PROVIDER_UNAVAILABLE', async () => {
    const ff = fakeFetch(() => ({ status: 503, body: { error: 'down' } }));
    const p = new OpenAIRealtimeProvider('sk-secret', ff.fetch);
    await expect(
      p.createClientSecret(
        {
          tier: 'tier1_s2s',
          model: 'm',
          transport: 'webrtc',
          targetLanguage: 'en',
          expiresInSeconds: 60,
        },
        { correlationId: 'c' },
      ),
    ).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
  });
});
