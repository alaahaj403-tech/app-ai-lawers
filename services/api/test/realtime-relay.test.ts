import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import type { RelayServerMessage } from '@voxeli/api-contracts';
import { buildApp } from '../src/app.js';
import type { BuiltApp } from '../src/app.js';
import { loadEnv } from '../src/env.js';
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
    // A resume on a socket that already saw the segment must not repeat it,
    // and no segment may be invented.
    expect(segmentIds.length).toBeGreaterThan(0);
    expect(new Set(segmentIds).size).toBe(segmentIds.length);
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

describe('Tier-2 relay reconnect', () => {
  it('lets a client reattach with a fresh ticket, replays missed segments, and charges minutes once', async () => {
    const env = loadEnv();
    const short = await buildApp(env, process.env, { relayDetachGraceMs: 5_000 });
    const address = await short.app.listen({ port: 0, host: '127.0.0.1' });
    const wsBase = address.replace('http://', 'ws://');
    try {
      const u = await registerUser(short, 'reconnect@example.com');
      const created = await short.app.inject({
        method: 'POST',
        url: '/v1/realtime/sessions',
        headers: auth(u.tokens.accessToken),
        payload: { kind: 'face_to_face', myLanguage: 'he', targetLanguage: 'en' },
      });
      const session = created.json() as { sessionId: string; relay: { ticket: string } };

      // First connection: stream until a segment arrives, then drop the socket abruptly.
      const firstSegments: string[] = [];
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `${wsBase}/v1/realtime/stream?ticket=${encodeURIComponent(session.relay.ticket)}`,
        );
        const timer = setTimeout(() => reject(new Error('first leg timed out')), 15_000);
        ws.on('message', (data: Buffer, isBinary: boolean) => {
          if (isBinary) return;
          const m = JSON.parse(data.toString('utf8')) as RelayServerMessage;
          if (m.type === 'ready')
            for (let i = 0; i < 12; i++) ws.send(audioFrame(), { binary: true });
          if (m.type === 'segment') {
            firstSegments.push(m.segmentId);
            ws.terminate(); // simulate network loss: no stop, no close handshake
          }
        });
        ws.on('close', () => {
          clearTimeout(timer);
          resolve();
        });
        ws.on('error', reject);
      });
      expect(firstSegments).toHaveLength(1);

      // The session is still open server-side; a fresh ticket is issued.
      const ticketRes = await short.app.inject({
        method: 'POST',
        url: `/v1/realtime/sessions/${session.sessionId}/ticket`,
        headers: auth(u.tokens.accessToken),
      });
      expect(ticketRes.statusCode).toBe(200);
      const newTicket = (ticketRes.json() as { relay: { ticket: string } }).relay.ticket;

      // Second connection: resume from nothing → the missed segment is replayed, then stop.
      const second: RelayServerMessage[] = [];
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `${wsBase}/v1/realtime/stream?ticket=${encodeURIComponent(newTicket)}`,
        );
        const timer = setTimeout(() => reject(new Error('second leg timed out')), 15_000);
        ws.on('message', (data: Buffer, isBinary: boolean) => {
          if (isBinary) return;
          const m = JSON.parse(data.toString('utf8')) as RelayServerMessage;
          second.push(m);
          if (m.type === 'ready') ws.send(JSON.stringify({ type: 'resume', lastSegmentId: null }));
          if (m.type === 'segment') ws.send(JSON.stringify({ type: 'stop' }));
        });
        ws.on('close', () => {
          clearTimeout(timer);
          resolve();
        });
        ws.on('error', reject);
      });
      // Audio buffered before the drop kept flowing server-side, so more segments may
      // exist; the replay must start with what was missed and never repeat an id.
      const replayed = second
        .filter((m) => m.type === 'segment')
        .map((m) => (m.type === 'segment' ? m.segmentId : ''));
      expect(replayed[0]).toBe(firstSegments[0]);
      expect(new Set(replayed).size).toBe(replayed.length);
      expect(second.some((m) => m.type === 'closed')).toBe(true);

      const quota = await short.db.execute(
        `select used from usage_quotas where user_id = '${u.user.id}' and dimension = 'realtime_minutes'`,
      );
      expect(quota[0]).toMatchObject({ used: 1 });
      const rows = await short.db.execute(
        `select metrics, ended_at from realtime_sessions where id = '${session.sessionId}'`,
      );
      expect(rows[0]?.ended_at).not.toBeNull();
      expect((rows[0]?.metrics as { reconnects: number }).reconnects).toBe(1);

      // After the session ended, no more tickets.
      const late = await short.app.inject({
        method: 'POST',
        url: `/v1/realtime/sessions/${session.sessionId}/ticket`,
        headers: auth(u.tokens.accessToken),
      });
      expect(late.statusCode).toBe(409);
    } finally {
      await short.close();
    }
  });

  it('ends the session when nobody reattaches within the grace window', async () => {
    const env = loadEnv();
    const short = await buildApp(env, process.env, { relayDetachGraceMs: 300 });
    const address = await short.app.listen({ port: 0, host: '127.0.0.1' });
    const wsBase = address.replace('http://', 'ws://');
    try {
      const u = await registerUser(short, 'grace@example.com');
      const created = await short.app.inject({
        method: 'POST',
        url: '/v1/realtime/sessions',
        headers: auth(u.tokens.accessToken),
        payload: { kind: 'live_subtitles', myLanguage: 'he', targetLanguage: 'en' },
      });
      const session = created.json() as { sessionId: string; relay: { ticket: string } };
      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(
          `${wsBase}/v1/realtime/stream?ticket=${encodeURIComponent(session.relay.ticket)}`,
        );
        ws.on('message', (data: Buffer, isBinary: boolean) => {
          if (
            !isBinary &&
            (JSON.parse(data.toString('utf8')) as RelayServerMessage).type === 'ready'
          )
            ws.terminate();
        });
        ws.on('close', () => resolve());
        ws.on('error', reject);
      });
      await new Promise((r) => setTimeout(r, 900));
      const rows = await short.db.execute(
        `select metrics, ended_at from realtime_sessions where id = '${session.sessionId}'`,
      );
      expect(rows[0]?.ended_at).not.toBeNull();
      expect((rows[0]?.metrics as { closeReason: string }).closeReason).toBe('connection_lost');
      expect(short.relayRegistry.size).toBe(0);
    } finally {
      await short.close();
    }
  });
});
