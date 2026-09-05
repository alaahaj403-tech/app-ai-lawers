import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltApp } from '../src/app.js';
import { registerUser, startTestApp, truncateAll } from './helpers.js';

let built: BuiltApp;
beforeAll(async () => {
  built = await startTestApp();
});
afterAll(async () => built.close());
beforeEach(async () => truncateAll(built));

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

describe('POST /v1/translate (vertical slice)', () => {
  it('translates, persists to history, records usage and quota', async () => {
    const { tokens, user } = await registerUser(built, 'u1@example.com');
    const res = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(tokens.accessToken),
      payload: {
        text: 'Invoice 2043 is due on 2026-10-01.',
        targetLanguage: 'he',
        mode: 'business',
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBeTruthy();
    expect(body.result.targetLanguage).toBe('he');
    expect(body.result.translatedText).toContain('2043');
    expect(body.result.integrity.violations).toEqual([]);
    expect(body.routing.slot).toBe('translation.default');
    expect(body.quota).toEqual({ dimension: 'translations', used: 1, limit: 300 });
    // provider/model names must not leak to clients
    expect(JSON.stringify(body)).not.toMatch(/gpt|openai|mock/i);

    // One row per provider attempt. The first pass is `translate.text`; a repair
    // pass records `translate.text.repair`, and the mock provider echoes the
    // source, which the source-script check treats as a leak worth retrying.
    const usage = await built.db.execute(
      sql`select feature, success, user_id from ai_usage where feature = 'translate.text'`,
    );
    expect(usage.length).toBe(1);
    expect(usage[0]).toMatchObject({ feature: 'translate.text', success: true, user_id: user.id });

    const history = await built.app.inject({
      method: 'GET',
      url: '/v1/translations',
      headers: auth(tokens.accessToken),
    });
    expect(history.json().items).toHaveLength(1);
    expect(history.json().items[0].sourceText).toBe('Invoice 2043 is due on 2026-10-01.');
  });

  it('honours no-history mode', async () => {
    const { tokens } = await registerUser(built, 'u2@example.com');
    const res = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(tokens.accessToken),
      payload: { text: 'private note', targetLanguage: 'ar', saveToHistory: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().id).toBeNull();
    const history = await built.app.inject({
      method: 'GET',
      url: '/v1/translations',
      headers: auth(tokens.accessToken),
    });
    expect(history.json().items).toHaveLength(0);
  });

  it('is idempotent per user with an idempotencyKey', async () => {
    const { tokens } = await registerUser(built, 'u3@example.com');
    const key = randomUUID();
    const payload = { text: 'hello again', targetLanguage: 'de', idempotencyKey: key };
    const a = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(tokens.accessToken),
      payload,
    });
    const b = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(tokens.accessToken),
      payload,
    });
    expect(a.json().id).toBe(b.json().id);
    expect(b.json().quota.used).toBe(1);
  });

  it('enforces the free-plan translation quota and reports QUOTA_EXCEEDED', async () => {
    const { tokens, user } = await registerUser(built, 'u4@example.com');
    await built.db.execute(sql`insert into usage_quotas (user_id, dimension, period, used)
      values (${user.id}, 'translations', to_char(now() at time zone 'utc', 'YYYY-MM'), 300)`);
    const res = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(tokens.accessToken),
      payload: { text: 'x y z', targetLanguage: 'he' },
    });
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('QUOTA_EXCEEDED');
  });

  it('validates input: unsupported language, empty text, oversized text', async () => {
    const { tokens } = await registerUser(built, 'u5@example.com');
    const bad = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(tokens.accessToken),
      payload: { text: 'hi', targetLanguage: 'xx' },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error.issues[0].path).toBe('targetLanguage');
    const empty = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(tokens.accessToken),
      payload: { text: '   ', targetLanguage: 'he' },
    });
    expect(empty.statusCode).toBe(400);
    const big = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(tokens.accessToken),
      payload: { text: 'a'.repeat(6000), targetLanguage: 'he' },
    });
    expect(big.statusCode).toBe(400);
  });

  it('requires authentication', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      payload: { text: 'hi', targetLanguage: 'he' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('history ownership (IDOR/BOLA)', () => {
  it("a user cannot read, favourite or delete another user's translation", async () => {
    const a = await registerUser(built, 'a@example.com');
    const b = await registerUser(built, 'b@example.com');
    const created = await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(a.tokens.accessToken),
      payload: { text: 'secret text', targetLanguage: 'he' },
    });
    const id = created.json().id as string;

    const listB = await built.app.inject({
      method: 'GET',
      url: '/v1/translations',
      headers: auth(b.tokens.accessToken),
    });
    expect(listB.json().items).toHaveLength(0);

    const patchB = await built.app.inject({
      method: 'PATCH',
      url: `/v1/translations/${id}`,
      headers: auth(b.tokens.accessToken),
      payload: { favorite: true },
    });
    expect(patchB.statusCode).toBe(404);
    const delB = await built.app.inject({
      method: 'DELETE',
      url: `/v1/translations/${id}`,
      headers: auth(b.tokens.accessToken),
    });
    expect(delB.statusCode).toBe(404);

    const patchA = await built.app.inject({
      method: 'PATCH',
      url: `/v1/translations/${id}`,
      headers: auth(a.tokens.accessToken),
      payload: { favorite: true },
    });
    expect(patchA.statusCode).toBe(200);
    const delA = await built.app.inject({
      method: 'DELETE',
      url: `/v1/translations/${id}`,
      headers: auth(a.tokens.accessToken),
    });
    expect(delA.statusCode).toBe(204);
  });

  it('paginates with cursors and deletes everything on request', async () => {
    const { tokens } = await registerUser(built, 'p@example.com');
    for (let i = 0; i < 5; i++) {
      await built.app.inject({
        method: 'POST',
        url: '/v1/translate',
        headers: auth(tokens.accessToken),
        payload: { text: `sentence number ${i + 20}`, targetLanguage: 'fr' },
      });
    }
    const p1 = await built.app.inject({
      method: 'GET',
      url: '/v1/translations?limit=2',
      headers: auth(tokens.accessToken),
    });
    expect(p1.json().items).toHaveLength(2);
    expect(p1.json().nextCursor).toBeTruthy();
    const p2 = await built.app.inject({
      method: 'GET',
      url: `/v1/translations?limit=2&cursor=${p1.json().nextCursor}`,
      headers: auth(tokens.accessToken),
    });
    expect(p2.json().items).toHaveLength(2);
    expect(p2.json().items[0].id).not.toBe(p1.json().items[0].id);
    const wipe = await built.app.inject({
      method: 'DELETE',
      url: '/v1/translations',
      headers: auth(tokens.accessToken),
    });
    expect(wipe.json().deleted).toBe(5);
  });
});
