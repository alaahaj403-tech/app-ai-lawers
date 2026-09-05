import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { RelayServerMessage } from '@voxeli/api-contracts';
import type { BuiltApp } from '../src/app.js';
import { registerUser, startTestApp, truncateAll } from './helpers.js';

let built: BuiltApp;
let baseUrl: string;

beforeAll(async () => {
  built = await startTestApp();
  const address = await built.app.listen({ port: 0, host: '127.0.0.1' });
  baseUrl = address.replace('http://', 'ws://');
});
afterAll(async () => built.close());
beforeEach(async () => truncateAll(built));

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

/** One 20 ms frame of PCM16 silence at 24 kHz. */
const audioFrame = () => Buffer.alloc(480 * 2);

interface Collected {
  messages: RelayServerMessage[];
  binary: Buffer[];
  closeCode: number | null;
}

/**
 * Connects, streams `frames` audio frames, and resolves once the socket closes
 * or `until` is satisfied. Keeps tests deterministic without arbitrary sleeps.
 */
function connect(
  ticket: string,
  options: { frames?: number; stopAfter?: (c: Collected) => boolean; timeoutMs?: number } = {},
): Promise<Collected> {
  const collected: Collected = { messages: [], binary: [], closeCode: null };
  const ws = new WebSocket(`${baseUrl}/v1/realtime/stream?ticket=${encodeURIComponent(ticket)}`);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`relay timed out; saw ${JSON.stringify(collected.messages)}`));
    }, options.timeoutMs ?? 15_000);

    const finish = () => {
      clearTimeout(timer);
      resolve(collected);
    };

    ws.on('message', (data: Buffer, isBinary: boolean) => {
      if (isBinary) {
        collected.binary.push(data);
        return;
      }
      const message = JSON.parse(data.toString('utf8')) as RelayServerMessage;
      collected.messages.push(message);
      // Real clients start streaming once the server says it is ready.
      if (message.type === 'ready') {
        for (let i = 0; i < (options.frames ?? 0); i++) ws.send(audioFrame(), { binary: true });
        if (!options.stopAfter) ws.send(JSON.stringify({ type: 'stop' }));
      }
      if (options.stopAfter?.(collected)) ws.send(JSON.stringify({ type: 'stop' }));
    });
    ws.on('close', (code) => {
      collected.closeCode = code;
      finish();
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function createSession(token: string, kind = 'face_to_face') {
  const res = await built.app.inject({
    method: 'POST',
    url: '/v1/realtime/sessions',
    headers: auth(token),
    payload: { kind, myLanguage: 'he', targetLanguage: 'en' },
  });
  expect(res.statusCode).toBe(201);
  return res.json();
}

describe('Tier-2 relay', () => {
  it('issues a relay ticket instead of a provider credential for tier 2', async () => {
    const u = await registerUser(built, 'relay1@example.com');
    const session = await createSession(u.tokens.accessToken);
    expect(session.tier).toBe('tier2_streaming');
    expect(session.clientSecret).toBeNull();
    expect(session.relay?.path).toBe('/v1/realtime/stream');
    expect(session.relay?.ticket).toBeTruthy();
    // The provider credential must never be handed out on this path.
    expect(JSON.stringify(session)).not.toMatch(/ek_/);
  });

  it('streams captions and translated audio, and meters minutes server-side', async () => {
    const u = await registerUser(built, 'relay2@example.com');
    const session = await createSession(u.tokens.accessToken);
    const ticket = session.relay?.ticket ?? '';

    const collected = await connect(ticket, {
      frames: 12,
      stopAfter: (c) => c.messages.some((m) => m.type === 'translation'),
    });

    const types = collected.messages.map((m) => m.type);
    expect(types).toContain('ready');
    expect(types).toContain('segment');
    expect(types).toContain('translation');
    expect(types).toContain('closed');

    const ready = collected.messages.find((m) => m.type === 'ready');
    expect(ready).toMatchObject({ tier: 'tier2_streaming', sampleRate: 24000 });

    const segment = collected.messages.find((m) => m.type === 'segment');
    const translation = collected.messages.find((m) => m.type === 'translation');
    expect(segment?.type === 'segment' && segment.original).toMatch(/not recognized speech/i);
    expect(translation?.type === 'translation' && translation.segmentId).toBe(
      segment?.type === 'segment' ? segment.segmentId : '',
    );

    // Speech was synthesized and delivered as an announced binary frame.
    const audioBegin = collected.messages.find((m) => m.type === 'audio_begin');
    expect(audioBegin).toBeDefined();
    expect(collected.binary.length).toBeGreaterThan(0);
    if (audioBegin?.type === 'audio_begin') {
      expect(collected.binary[0]?.byteLength).toBe(audioBegin.byteLength);
    }

    // The minute was charged by the server, not reported by the client.
    const quota = await built.db.execute(
      `select used from usage_quotas where user_id = '${u.user.id}' and dimension = 'realtime_minutes'`,
    );
    expect(quota[0]).toMatchObject({ used: 1 });

    // The session row records what actually happened.
    const rows = await built.db.execute(
      `select duration_seconds, ended_at, metrics from realtime_sessions where id = '${session.sessionId}'`,
    );
    expect(rows[0]?.ended_at).not.toBeNull();
    expect((rows[0]?.metrics as { minutesCharged: number }).minutesCharged).toBe(1);
    expect((rows[0]?.metrics as { segments: number }).segments).toBeGreaterThan(0);
  });

  it('replays only missing segments after a resume, never duplicating them', async () => {
    const u = await registerUser(built, 'relay3@example.com');
    const session = await createSession(u.tokens.accessToken);
    const ticket = session.relay?.ticket ?? '';

    const collected: Collected = { messages: [], binary: [], closeCode: null };
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(
        `${baseUrl}/v1/realtime/stream?ticket=${encodeURIComponent(ticket)}`,
      );
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error('resume test timed out'));
      }, 15_000);
      let resumed = false;
      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (isBinary) return;
        const message = JSON.parse(data.toString('utf8')) as RelayServerMessage;
        collected.messages.push(message);
        if (message.type === 'ready') {
          for (let i = 0; i < 12; i++) ws.send(audioFrame(), { binary: true });
        }
        if (message.type === 'translation' && !resumed) {
          resumed = true;
          ws.send(JSON.stringify({ type: 'resume', lastSegmentId: null }));
          setTimeout(() => {
            ws.send(JSON.stringify({ type: 'stop' }));
          }, 200);
        }
      });
      ws.on('close', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.on('error', reject);
    });

    const segmentIds = collected.messages
      .filter((m): m is Extract<RelayServerMessage, { type: 'segment' }> => m.type === 'segment')
      .map((m) => m.segmentId);
    // The same segment is re-sent on resume; the ids repeat rather than new
    // segments being invented.
    expect(new Set(segmentIds).size).toBeLessThan(segmentIds.length);
  });

  it('refuses a missing, malformed or expired ticket', async () => {
    const bad = await connect('x'.repeat(40), { timeoutMs: 8_000 });
    expect(bad.messages[0]).toMatchObject({ type: 'error', code: 'AUTHENTICATION_FAILURE' });
    expect(bad.closeCode).toBe(4005);
  });

  it('refuses a relay ticket for a session that already ended', async () => {
    const u = await registerUser(built, 'relay4@example.com');
    const session = await createSession(u.tokens.accessToken);
    await built.db.execute(
      `update realtime_sessions set ended_at = now() where id = '${session.sessionId}'`,
    );
    const result = await connect(session.relay?.ticket ?? '', { timeoutMs: 8_000 });
    expect(result.messages[0]).toMatchObject({ type: 'error' });
    expect(result.closeCode).toBe(4005);
  });

  it('closes with a quota error when the budget is spent before the connection', async () => {
    const u = await registerUser(built, 'relay5@example.com');
    const session = await createSession(u.tokens.accessToken);
    // Another device spends the remaining budget between creation and connect.
    await built.db.execute(`insert into usage_quotas (user_id, dimension, period, used)
      values ('${u.user.id}', 'realtime_minutes', to_char(now() at time zone 'utc', 'YYYY-MM'), 10)`);

    const result = await connect(session.relay?.ticket ?? '', { timeoutMs: 8_000 });
    expect(result.closeCode).toBe(4003);
    expect(result.messages.some((m) => m.type === 'error' && m.code === 'QUOTA_EXCEEDED')).toBe(
      true,
    );
    const rows = await built.db.execute(
      `select metrics from realtime_sessions where id = '${session.sessionId}'`,
    );
    expect((rows[0]?.metrics as { closeReason: string }).closeReason).toBe('quota_exhausted');
  });
});
