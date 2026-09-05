import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltApp } from '../src/app.js';
import { makeAdmin, registerUser, setPlan, startTestApp, truncateAll } from './helpers.js';

let built: BuiltApp;
beforeAll(async () => {
  built = await startTestApp();
});
afterAll(async () => built.close());
beforeEach(async () => truncateAll(built));

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

describe('realtime sessions', () => {
  it('free plan gets tier 2 with an explicit degraded reason; pro gets tier 1', async () => {
    const free = await registerUser(built, 'free@example.com');
    const r1 = await built.app.inject({
      method: 'POST',
      url: '/v1/realtime/sessions',
      headers: auth(free.tokens.accessToken),
      payload: { kind: 'face_to_face', myLanguage: 'he', targetLanguage: 'en' },
    });
    expect(r1.statusCode).toBe(201);
    expect(r1.json().tier).toBe('tier2_streaming');
    expect(r1.json().degraded).toBe(true);
    expect(r1.json().degradedReason).toBe('plan_does_not_include_tier1');
    expect(r1.json().clientSecret.value).toMatch(/^ek_/);

    const pro = await registerUser(built, 'pro@example.com');
    await setPlan(built, pro.user.id, 'pro');
    const login = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'pro@example.com', password: 'correct-horse-battery-staple' },
    });
    const r2 = await built.app.inject({
      method: 'POST',
      url: '/v1/realtime/sessions',
      headers: auth(login.json().tokens.accessToken),
      payload: {
        kind: 'interpreter_call',
        myLanguage: 'he',
        targetLanguage: 'he',
        remoteLanguage: 'en',
      },
    });
    expect(r2.statusCode).toBe(201);
    expect(r2.json().tier).toBe('tier1_s2s');
    expect(r2.json().degraded).toBe(false);
  });

  it('rejects interpreter calls without a remote language and recording while the flag is off', async () => {
    const u = await registerUser(built, 'x@example.com');
    const noRemote = await built.app.inject({
      method: 'POST',
      url: '/v1/realtime/sessions',
      headers: auth(u.tokens.accessToken),
      payload: { kind: 'interpreter_call', myLanguage: 'he', targetLanguage: 'he' },
    });
    expect(noRemote.statusCode).toBe(400);
    const rec = await built.app.inject({
      method: 'POST',
      url: '/v1/realtime/sessions',
      headers: auth(u.tokens.accessToken),
      payload: { kind: 'live_recording', myLanguage: 'he', targetLanguage: 'en', recording: true },
    });
    expect(rec.statusCode).toBe(422);
    expect(rec.json().error.code).toBe('UNSUPPORTED_PLATFORM_CAPABILITY');
  });

  it('closes a session with metrics, charges minutes once, and enforces ownership', async () => {
    const a = await registerUser(built, 'ra@example.com');
    const b = await registerUser(built, 'rb@example.com');
    const created = await built.app.inject({
      method: 'POST',
      url: '/v1/realtime/sessions',
      headers: auth(a.tokens.accessToken),
      payload: { kind: 'live_subtitles', myLanguage: 'auto', targetLanguage: 'he' },
    });
    const id = created.json().sessionId as string;
    const foreign = await built.app.inject({
      method: 'POST',
      url: `/v1/realtime/sessions/${id}/metrics`,
      headers: auth(b.tokens.accessToken),
      payload: { durationSeconds: 90 },
    });
    expect(foreign.statusCode).toBe(404);
    const close = await built.app.inject({
      method: 'POST',
      url: `/v1/realtime/sessions/${id}/metrics`,
      headers: auth(a.tokens.accessToken),
      payload: { durationSeconds: 90, firstTranslationMs: 800 },
    });
    expect(close.json()).toEqual({ ok: true, alreadyClosed: false });
    const again = await built.app.inject({
      method: 'POST',
      url: `/v1/realtime/sessions/${id}/metrics`,
      headers: auth(a.tokens.accessToken),
      payload: { durationSeconds: 90 },
    });
    expect(again.json().alreadyClosed).toBe(true);
    const next = await built.app.inject({
      method: 'POST',
      url: '/v1/realtime/sessions',
      headers: auth(a.tokens.accessToken),
      payload: { kind: 'live_subtitles', myLanguage: 'auto', targetLanguage: 'he' },
    });
    expect(next.json().quota).toEqual({ dimension: 'realtime_minutes', used: 2, limit: 10 });
  });
});

describe('feature flags', () => {
  it('are public to read, admin-only to write, and audited', async () => {
    const u = await registerUser(built, 'user@example.com');
    const admin = await registerUser(built, 'admin@example.com');
    await makeAdmin(built, admin.user.id);
    const adminLogin = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'admin@example.com', password: 'correct-horse-battery-staple' },
    });
    const adminToken = adminLogin.json().tokens.accessToken as string;

    const pub = await built.app.inject({ method: 'GET', url: '/v1/flags' });
    expect(pub.statusCode).toBe(200);
    expect(pub.json().flags.live_translation).toBe(true);
    expect(pub.json().flags.call_recording).toBe(false);

    const forbidden = await built.app.inject({
      method: 'PUT',
      url: '/v1/admin/flags/voip',
      headers: auth(u.tokens.accessToken),
      payload: { enabled: true },
    });
    expect(forbidden.statusCode).toBe(403);
    const anon = await built.app.inject({
      method: 'PUT',
      url: '/v1/admin/flags/voip',
      payload: { enabled: true },
    });
    expect(anon.statusCode).toBe(401);

    const ok = await built.app.inject({
      method: 'PUT',
      url: '/v1/admin/flags/live_translation',
      headers: auth(adminToken),
      payload: { enabled: false },
    });
    expect(ok.statusCode).toBe(200);
    const unknown = await built.app.inject({
      method: 'PUT',
      url: '/v1/admin/flags/not_a_flag',
      headers: auth(adminToken),
      payload: { enabled: true },
    });
    expect(unknown.statusCode).toBe(400);

    // Kill switch takes effect
    const rt = await built.app.inject({
      method: 'POST',
      url: '/v1/realtime/sessions',
      headers: auth(u.tokens.accessToken),
      payload: { kind: 'face_to_face', myLanguage: 'he', targetLanguage: 'en' },
    });
    expect(rt.statusCode).toBe(422);

    const audit = await built.db.execute(
      `select action, target_id from audit_events where action = 'admin.flag.set'`,
    );
    expect(audit.length).toBe(1);
    expect(audit[0]).toMatchObject({ target_id: 'live_translation' });
  });
});

describe('platform', () => {
  it('health and readiness respond; unknown routes return a typed 404', async () => {
    expect((await built.app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    const ready = await built.app.inject({ method: 'GET', url: '/ready' });
    expect(ready.json()).toMatchObject({ status: 'ok', database: 'ok', aiProvider: 'mock' });
    const nf = await built.app.inject({ method: 'GET', url: '/nope' });
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error.code).toBe('NOT_FOUND');
  });
});

describe('speech synthesis', () => {
  it('returns audio bytes, charges audio minutes, and records usage', async () => {
    const u = await registerUser(built, 'tts@example.com');
    const res = await built.app.inject({
      method: 'POST',
      url: '/v1/speech',
      headers: auth(u.tokens.accessToken),
      payload: { text: 'שלום, מה שלומך היום?', language: 'he', format: 'wav' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('audio/wav');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.rawPayload.byteLength).toBeGreaterThan(44);
    expect(res.rawPayload.subarray(0, 4).toString('ascii')).toBe('RIFF');

    const usage = await built.db.execute(
      `select feature, unit, success from ai_usage where feature = 'speech.synthesis'`,
    );
    expect(usage[0]).toMatchObject({ unit: 'characters', success: true });

    const quota = await built.db.execute(
      `select used from usage_quotas where user_id = '${u.user.id}' and dimension = 'audio_minutes'`,
    );
    expect(quota[0]).toMatchObject({ used: 1 });
  });

  it('validates language and text length, and requires authentication', async () => {
    const u = await registerUser(built, 'tts2@example.com');
    const badLang = await built.app.inject({
      method: 'POST',
      url: '/v1/speech',
      headers: auth(u.tokens.accessToken),
      payload: { text: 'hello', language: 'xx' },
    });
    expect(badLang.statusCode).toBe(400);
    const tooLong = await built.app.inject({
      method: 'POST',
      url: '/v1/speech',
      headers: auth(u.tokens.accessToken),
      payload: { text: 'a'.repeat(5000), language: 'en' },
    });
    expect(tooLong.statusCode).toBe(400);
    const anon = await built.app.inject({
      method: 'POST',
      url: '/v1/speech',
      payload: { text: 'hi', language: 'en' },
    });
    expect(anon.statusCode).toBe(401);
  });

  it('refuses synthesis once the audio-minute quota is exhausted', async () => {
    const u = await registerUser(built, 'tts3@example.com');
    await built.db.execute(`insert into usage_quotas (user_id, dimension, period, used)
      values ('${u.user.id}', 'audio_minutes', to_char(now() at time zone 'utc', 'YYYY-MM'), 20)`);
    const res = await built.app.inject({
      method: 'POST',
      url: '/v1/speech',
      headers: auth(u.tokens.accessToken),
      payload: { text: 'hello there', language: 'en' },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('QUOTA_EXCEEDED');
  });
});
