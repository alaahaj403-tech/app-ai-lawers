import { failures } from '@voxeli/domain';
import type { CallContext, ProviderId } from './types.js';

/**
 * Minimal socket abstraction so this package stays transport-agnostic: the
 * server injects a `ws`-backed factory, tests inject a fake. Node's global
 * WebSocket cannot set request headers, which provider authentication needs.
 */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onOpen(cb: () => void): void;
  onMessage(cb: (data: string) => void): void;
  onError(cb: (error: unknown) => void): void;
  onClose(cb: (code: number, reason: string) => void): void;
}

export type SocketFactory = (url: string, headers: Record<string, string>) => SocketLike;

export interface LiveTranscriptDelta {
  readonly text: string;
  readonly at: number;
  readonly final?: boolean;
}

export interface LiveTranscriptionSession {
  /** Append raw little-endian PCM16 audio at the session's sample rate. */
  push(pcm: Uint8Array): void;
  onDelta(cb: (delta: LiveTranscriptDelta) => void): void;
  onError(cb: (error: unknown) => void): void;
  close(): void;
}

export interface LiveTranscriptionOptions {
  /** Known spoken languages. Supplying them lowers latency and error rate. */
  readonly languageHints?: readonly string[];
  readonly sampleRate: number;
}

export interface LiveTranscriptionProvider {
  readonly id: ProviderId;
  open(
    model: string,
    options: LiveTranscriptionOptions,
    ctx: CallContext,
  ): Promise<LiveTranscriptionSession>;
}

const OPENAI_REALTIME_WS = 'wss://api.openai.com/v1/realtime';

/**
 * Server-side live transcription over the provider's realtime WebSocket.
 * Verified against the official realtime transcription documentation
 * (2026-09-04): a `transcription` session, `input_audio_buffer.append` with
 * base64 PCM, and `conversation.item.input_audio_transcription.delta` /
 * `.completed` events.
 *
 * Holding this connection on the server — instead of handing the device an
 * ephemeral credential — is what lets us meter realtime minutes from the
 * media path rather than from a client-reported duration.
 */
export class OpenAILiveTranscriptionProvider implements LiveTranscriptionProvider {
  readonly id = 'openai' as const;

  constructor(
    private readonly apiKey: string,
    private readonly socketFactory: SocketFactory,
    private readonly connectTimeoutMs = 10_000,
  ) {}

  open(
    model: string,
    options: LiveTranscriptionOptions,
    ctx: CallContext,
  ): Promise<LiveTranscriptionSession> {
    const socket = this.socketFactory(OPENAI_REALTIME_WS, {
      Authorization: `Bearer ${this.apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
      'x-correlation-id': ctx.correlationId,
    });

    return new Promise<LiveTranscriptionSession>((resolve, reject) => {
      const deltaHandlers: ((d: LiveTranscriptDelta) => void)[] = [];
      const errorHandlers: ((e: unknown) => void)[] = [];
      let settled = false;
      let closed = false;

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.close(1000, 'timeout');
        reject(failures.timeout('Transcription session did not open'));
      }, this.connectTimeoutMs);

      const fail = (error: unknown) => {
        if (settled) {
          for (const h of errorHandlers) h(error);
          return;
        }
        settled = true;
        clearTimeout(timer);
        reject(failures.providerUnavailable('Live transcription unavailable', { cause: error }));
      };

      socket.onError(fail);
      socket.onClose((code, reason) => {
        closed = true;
        if (!settled) fail(new Error(`socket closed: ${code} ${reason}`));
      });

      socket.onOpen(() => {
        socket.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              type: 'transcription',
              audio: {
                input: {
                  format: { type: 'audio/pcm', rate: options.sampleRate },
                  transcription: {
                    model,
                    ...(options.languageHints?.length ? { languages: options.languageHints } : {}),
                  },
                  noise_reduction: { type: 'near_field' },
                },
              },
            },
          }),
        );
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          push(pcm) {
            if (closed || pcm.byteLength === 0) return;
            socket.send(
              JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: Buffer.from(pcm).toString('base64'),
              }),
            );
          },
          onDelta(cb) {
            deltaHandlers.push(cb);
          },
          onError(cb) {
            errorHandlers.push(cb);
          },
          close() {
            if (closed) return;
            closed = true;
            socket.close(1000, 'done');
          },
        });
      });

      socket.onMessage((raw) => {
        let event: { type?: unknown; delta?: unknown; transcript?: unknown; error?: unknown };
        try {
          event = JSON.parse(raw) as typeof event;
        } catch {
          return; // provider frames are untrusted input; ignore malformed ones
        }
        const at = Date.now();
        if (event.type === 'conversation.item.input_audio_transcription.delta') {
          if (typeof event.delta === 'string' && event.delta.length > 0) {
            for (const h of deltaHandlers) h({ text: event.delta, at });
          }
        } else if (event.type === 'conversation.item.input_audio_transcription.completed') {
          // The completed event repeats the whole utterance; deltas already
          // carried the text, so emit only the end-of-turn marker.
          for (const h of deltaHandlers) h({ text: '', at, final: true });
        } else if (event.type === 'error') {
          for (const h of errorHandlers) h(event.error ?? new Error('provider error'));
        }
      });
    });
  }
}

/**
 * Placeholder transcript so the relay path is exercised end to end without a
 * provider. The text says plainly that it is not a transcription — no
 * developer or tester should mistake it for recognized speech.
 */
export const MOCK_TRANSCRIPT_SCRIPT: readonly LiveTranscriptDelta[] = [
  { text: 'Development transcript, not recognized speech.', at: 0, final: true },
  { text: 'Second development segment, still not real speech.', at: 0, final: true },
];

/** Scripted provider for tests and local development. */
export class MockLiveTranscriptionProvider implements LiveTranscriptionProvider {
  readonly id = 'mock' as const;
  /** Emits one delta per N pushed audio chunks, cycling through this script. */
  constructor(
    private readonly script: readonly LiveTranscriptDelta[] = MOCK_TRANSCRIPT_SCRIPT,
    private readonly chunksPerDelta = 3,
  ) {}

  open(): Promise<LiveTranscriptionSession> {
    const deltaHandlers: ((d: LiveTranscriptDelta) => void)[] = [];
    let chunks = 0;
    let index = 0;
    const script = this.script;
    const chunksPerDelta = this.chunksPerDelta;
    return Promise.resolve({
      push() {
        chunks += 1;
        if (chunks % chunksPerDelta !== 0) return;
        const next = script[index];
        if (!next) return;
        index += 1;
        for (const h of deltaHandlers) h({ ...next, at: Date.now() });
      },
      onDelta(cb) {
        deltaHandlers.push(cb);
      },
      onError() {
        /* the mock never errors */
      },
      close() {
        /* nothing to release */
      },
    });
  }
}
