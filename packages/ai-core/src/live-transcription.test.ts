import { describe, expect, it, vi } from 'vitest';
import {
  MOCK_TRANSCRIPT_SCRIPT,
  MockLiveTranscriptionProvider,
  OpenAILiveTranscriptionProvider,
} from './live-transcription.js';
import type { SocketLike } from './live-transcription.js';

function fakeSocket() {
  const sent: string[] = [];
  const handlers: Record<string, ((...args: never[]) => void)[]> = {};
  const on = (name: string, cb: (...args: never[]) => void): void => {
    (handlers[name] ??= []).push(cb);
  };
  const emit = (name: string, ...args: unknown[]) => {
    for (const h of handlers[name] ?? []) (h as (...a: unknown[]) => void)(...args);
  };
  const socket: SocketLike = {
    send: (d) => {
      sent.push(d);
    },
    close: () => {
      emit('close', 1000, 'closed');
    },
    onOpen: (cb) => {
      on('open', cb);
    },
    onMessage: (cb) => {
      on('message', cb);
    },
    onError: (cb) => {
      on('error', cb);
    },
    onClose: (cb) => {
      on('close', cb);
    },
  };
  return { socket, sent, emit };
}

describe('OpenAILiveTranscriptionProvider', () => {
  it('opens a transcription session with the model, sample rate and language hints', async () => {
    const f = fakeSocket();
    const headersSeen: Record<string, string>[] = [];
    const provider = new OpenAILiveTranscriptionProvider('sk-test', (url, headers) => {
      expect(url).toBe('wss://api.openai.com/v1/realtime');
      headersSeen.push(headers);
      queueMicrotask(() => {
        f.emit('open');
      });
      return f.socket;
    });

    const session = await provider.open(
      'gpt-live-transcribe',
      { sampleRate: 24000, languageHints: ['he', 'en'] },
      { correlationId: 'c1' },
    );
    expect(headersSeen[0]?.Authorization).toBe('Bearer sk-test');
    const update = JSON.parse(f.sent[0] ?? '{}') as {
      type: string;
      session: {
        type: string;
        audio: {
          input: {
            format: { rate: number };
            transcription: { model: string; languages: string[] };
          };
        };
      };
    };
    expect(update.type).toBe('session.update');
    expect(update.session.type).toBe('transcription');
    expect(update.session.audio.input.format.rate).toBe(24000);
    expect(update.session.audio.input.transcription).toMatchObject({
      model: 'gpt-live-transcribe',
      languages: ['he', 'en'],
    });

    const deltas: string[] = [];
    session.onDelta((d) => {
      deltas.push(d.final ? '[final]' : d.text);
    });
    f.emit(
      'message',
      JSON.stringify({ type: 'conversation.item.input_audio_transcription.delta', delta: 'שלום' }),
    );
    f.emit(
      'message',
      JSON.stringify({
        type: 'conversation.item.input_audio_transcription.completed',
        transcript: 'שלום',
      }),
    );
    expect(deltas).toEqual(['שלום', '[final]']);
  });

  it('base64-encodes appended audio and ignores empty buffers', async () => {
    const f = fakeSocket();
    const provider = new OpenAILiveTranscriptionProvider('sk', () => {
      queueMicrotask(() => {
        f.emit('open');
      });
      return f.socket;
    });
    const session = await provider.open('m', { sampleRate: 24000 }, { correlationId: 'c' });
    session.push(new Uint8Array([1, 0, 2, 0]));
    session.push(new Uint8Array());
    const appends = f.sent.filter((s) => s.includes('input_audio_buffer.append'));
    expect(appends).toHaveLength(1);
    expect((JSON.parse(appends[0] ?? '{}') as { audio: string }).audio).toBe(
      Buffer.from([1, 0, 2, 0]).toString('base64'),
    );
  });

  it('ignores malformed provider frames and surfaces provider errors', async () => {
    const f = fakeSocket();
    const provider = new OpenAILiveTranscriptionProvider('sk', () => {
      queueMicrotask(() => {
        f.emit('open');
      });
      return f.socket;
    });
    const session = await provider.open('m', { sampleRate: 24000 }, { correlationId: 'c' });
    const errors: unknown[] = [];
    session.onError((e) => {
      errors.push(e);
    });
    expect(() => {
      f.emit('message', 'not json');
    }).not.toThrow();
    f.emit('message', JSON.stringify({ type: 'error', error: { message: 'boom' } }));
    expect(errors).toHaveLength(1);
  });

  it('rejects with a timeout when the socket never opens', async () => {
    vi.useFakeTimers();
    const f = fakeSocket();
    const provider = new OpenAILiveTranscriptionProvider('sk', () => f.socket, 5_000);
    const pending = provider.open('m', { sampleRate: 24000 }, { correlationId: 'c' });
    const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(5_001);
    await assertion;
    vi.useRealTimers();
  });

  it('rejects when the socket closes before opening', async () => {
    const f = fakeSocket();
    const provider = new OpenAILiveTranscriptionProvider('sk', () => {
      queueMicrotask(() => {
        f.emit('close', 1006, 'abnormal');
      });
      return f.socket;
    });
    await expect(
      provider.open('m', { sampleRate: 24000 }, { correlationId: 'c' }),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});

describe('MockLiveTranscriptionProvider', () => {
  it('emits its script on a fixed audio cadence and labels itself as development output', async () => {
    const provider = new MockLiveTranscriptionProvider();
    const session = await provider.open();
    const seen: string[] = [];
    session.onDelta((d) => {
      seen.push(d.text);
    });
    for (let i = 0; i < 6; i++) session.push(new Uint8Array(960));
    expect(seen).toEqual(MOCK_TRANSCRIPT_SCRIPT.map((d) => d.text));
    expect(seen[0]).toMatch(/not recognized speech/i);
  });
});
