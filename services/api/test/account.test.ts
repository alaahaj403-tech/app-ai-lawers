import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import type { BuiltApp } from '../src/app.js';
import { runMigrations } from '../src/db/migrate.js';
import { seed } from '../src/db/seed.js';
import { loadEnv } from '../src/env.js';
import { CaptureEmailProvider } from '../src/modules/email/provider.js';
import { registerUser, truncateAll } from './helpers.js';

let built: BuiltApp;
const mailbox = new CaptureEmailProvider();

beforeAll(async () => {
  const env = loadEnv();
  await runMigrations(env.DATABASE_URL);
  await seed(env.DATABASE_URL);
  built = await buildApp(env, process.env, { email: mailbox });
  await built.app.ready();
});
afterAll(async () => built.close());
beforeEach(async () => {
  await truncateAll(built);
  mailbox.sent.length = 0;
});

const auth = (t: string) => ({ authorization: `Bearer ${t}` });
const linkToken = (text: string) => /[?&]token=([A-Za-z0-9_-]+)/.exec(text)?.[1] ?? '';

describe('email verification', () => {
  it('sends a localized verification email on registration and marks the account verified on confirm', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'v@example.com', password: 'correct-horse-battery-staple', locale: 'he' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().user.emailVerified).toBe(false);

    expect(mailbox.sent).toHaveLength(1);
    expect(mailbox.sent[0]?.to).toBe('v@example.com');
    expect(mailbox.sent[0]?.subject).toContain('Voxeli');
    expect(mailbox.sent[0]?.text).toMatch(/אישור|קישור/);
    const token = linkToken(mailbox.sent[0]?.text ?? '');
    expect(token.length).toBeGreaterThan(20);

    const confirm = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      payload: { token },
    });
    expect(confirm.statusCode).toBe(200);

    const me = await built.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: auth(res.json().tokens.accessToken),
    });
    expect(me.json().emailVerified).toBe(true);

    // Single use.
    const again = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/confirm',
      payload: { token },
    });
    expect(again.statusCode).toBe(400);
  });

  it('re-sends on request only for unverified accounts', async () => {
    const u = await registerUser(built, 'v2@example.com');
    mailbox.sent.length = 0;
    const r = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/verify-email/request',
      headers: auth(u.tokens.accessToken),
    });
    expect(r.statusCode).toBe(202);
    expect(mailbox.sent).toHaveLength(1);
    const anon = await built.app.inject({ method: 'POST', url: '/v1/auth/verify-email/request' });
    expect(anon.statusCode).toBe(401);
  });
});

describe('password reset', () => {
  it('answers identically for known and unknown emails', async () => {
    await registerUser(built, 'known@example.com');
    mailbox.sent.length = 0;
    const known = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      payload: { email: 'known@example.com' },
    });
    const unknown = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      payload: { email: 'nobody@example.com' },
    });
    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.body).toBe(unknown.body);
    expect(mailbox.sent).toHaveLength(1);
    expect(mailbox.sent[0]?.to).toBe('known@example.com');
  });

  it('resets the password, revokes every session, and consumes the token', async () => {
    const u = await registerUser(built, 'reset@example.com');
    mailbox.sent.length = 0;
    await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      payload: { email: 'reset@example.com' },
    });
    const token = linkToken(mailbox.sent[0]?.text ?? '');

    const weak = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token, password: 'short' },
    });
    expect(weak.statusCode).toBe(400);

    const ok = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token, password: 'a-brand-new-long-password' },
    });
    expect(ok.statusCode).toBe(200);

    // Old refresh token is dead; old password fails; new password works.
    const refresh = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: u.tokens.refreshToken },
    });
    expect(refresh.statusCode).toBe(401);
    const oldLogin = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'reset@example.com', password: 'correct-horse-battery-staple' },
    });
    expect(oldLogin.statusCode).toBe(401);
    const newLogin = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'reset@example.com', password: 'a-brand-new-long-password' },
    });
    expect(newLogin.statusCode).toBe(200);

    const reuse = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token, password: 'another-long-password-here' },
    });
    expect(reuse.statusCode).toBe(400);
  });

  it('rejects a forged or expired token', async () => {
    const u = await registerUser(built, 'exp@example.com');
    const forged = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token: 'x'.repeat(43), password: 'a-brand-new-long-password' },
    });
    expect(forged.statusCode).toBe(400);

    mailbox.sent.length = 0;
    await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/request',
      payload: { email: 'exp@example.com' },
    });
    const token = linkToken(mailbox.sent[0]?.text ?? '');
    await built.db.execute(
      `update auth_tokens set expires_at = now() - interval '1 minute' where user_id = '${u.user.id}'`,
    );
    const expired = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/password-reset/confirm',
      payload: { token, password: 'a-brand-new-long-password' },
    });
    expect(expired.statusCode).toBe(400);
  });
});

describe('account export and deletion', () => {
  it('exports everything held about the user as one JSON document', async () => {
    const u = await registerUser(built, 'export@example.com');
    await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(u.tokens.accessToken),
      payload: { text: 'export me 123', targetLanguage: 'he' },
    });
    const res = await built.app.inject({
      method: 'GET',
      url: '/v1/account/export',
      headers: auth(u.tokens.accessToken),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toContain('voxeli-export.json');
    const body = res.json();
    expect(body.user.email).toBe('export@example.com');
    expect(body.translations).toHaveLength(1);
    expect(body.translations[0].sourceText).toBe('export me 123');
    expect(body.activeSessions.length).toBeGreaterThan(0);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|argon2/);
  });

  it('deletes the account and everything that belongs to it, keeping only anonymized usage', async () => {
    const u = await registerUser(built, 'gone@example.com');
    await built.app.inject({
      method: 'POST',
      url: '/v1/translate',
      headers: auth(u.tokens.accessToken),
      payload: { text: 'delete me', targetLanguage: 'he' },
    });

    const wrong = await built.app.inject({
      method: 'DELETE',
      url: '/v1/account',
      headers: auth(u.tokens.accessToken),
      payload: { password: 'not-the-right-password' },
    });
    expect(wrong.statusCode).toBe(401);

    const del = await built.app.inject({
      method: 'DELETE',
      url: '/v1/account',
      headers: auth(u.tokens.accessToken),
      payload: { password: 'correct-horse-battery-staple' },
    });
    expect(del.statusCode).toBe(204);

    const count = async (table: string) => {
      const rows = await built.db.execute(
        `select count(*)::int as n from ${table} where user_id = '${u.user.id}'`,
      );
      return (rows[0] as { n: number }).n;
    };
    expect(await count('translations')).toBe(0);
    expect(await count('sessions')).toBe(0);
    expect(await count('usage_quotas')).toBe(0);
    expect(await count('auth_tokens')).toBe(0);
    expect(await count('ai_usage')).toBe(0); // user_id nulled, row kept
    const usageRows = await built.db.execute(
      `select count(*)::int as n from ai_usage where user_id is null`,
    );
    expect((usageRows[0] as { n: number }).n).toBeGreaterThan(0);
    const users = await built.db.execute(
      `select count(*)::int as n from users where email = 'gone@example.com'`,
    );
    expect((users[0] as { n: number }).n).toBe(0);

    // The access token still parses but the account is gone.
    const me = await built.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: auth(u.tokens.accessToken),
    });
    expect(me.statusCode).toBe(404);
    const login = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'gone@example.com', password: 'correct-horse-battery-staple' },
    });
    expect(login.statusCode).toBe(401);

    const audit = await built.db.execute(
      `select target_id from audit_events where action = 'account.deleted'`,
    );
    expect(audit.length).toBe(1);
    expect((audit[0] as { target_id: string }).target_id).not.toBe(u.user.id);
  });
});
