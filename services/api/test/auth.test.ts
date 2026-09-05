import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BuiltApp } from '../src/app.js';
import { registerUser, startTestApp, truncateAll } from './helpers.js';

let built: BuiltApp;
beforeAll(async () => {
  built = await startTestApp();
});
afterAll(async () => built.close());
beforeEach(async () => truncateAll(built));

describe('auth', () => {
  it('registers, returns profile and tokens, and never leaks the password hash', async () => {
    const res = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'Alice@Example.com',
        password: 'correct-horse-battery-staple',
        locale: 'he',
      },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.user.email).toBe('alice@example.com');
    expect(body.user.plan).toBe('free');
    expect(body.user.role).toBe('user');
    expect(body.user.locale).toBe('he');
    expect(JSON.stringify(body)).not.toMatch(/argon2/);
    expect(res.headers['x-correlation-id']).toBeTruthy();
  });

  it('rejects duplicate emails with CONFLICT and weak passwords with VALIDATION_FAILURE', async () => {
    await registerUser(built, 'dup@example.com');
    const dup = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'dup@example.com', password: 'correct-horse-battery-staple' },
    });
    expect(dup.statusCode).toBe(409);
    expect(dup.json().error.code).toBe('CONFLICT');
    const weak = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: { email: 'w@example.com', password: 'short' },
    });
    expect(weak.statusCode).toBe(400);
    expect(weak.json().error.code).toBe('VALIDATION_FAILURE');
  });

  it('logs in with correct credentials and rejects wrong ones identically', async () => {
    await registerUser(built, 'bob@example.com');
    const ok = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'bob@example.com', password: 'correct-horse-battery-staple' },
    });
    expect(ok.statusCode).toBe(200);
    const wrongPw = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'bob@example.com', password: 'wrong-password-here' },
    });
    const noUser = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: { email: 'nobody@example.com', password: 'wrong-password-here' },
    });
    expect(wrongPw.statusCode).toBe(401);
    expect(noUser.statusCode).toBe(401);
    expect(wrongPw.json().error.message).toBe(noUser.json().error.message);
  });

  it('rotates refresh tokens and rejects reuse of the old one', async () => {
    const { tokens } = await registerUser(built, 'carol@example.com');
    const r1 = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(r1.statusCode).toBe(200);
    const reuse = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(reuse.statusCode).toBe(401);
    const r2 = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: r1.json().tokens.refreshToken },
    });
    expect(r2.statusCode).toBe(200);
  });

  it('protects /me and accepts a valid bearer token', async () => {
    const { tokens } = await registerUser(built, 'dan@example.com');
    expect((await built.app.inject({ method: 'GET', url: '/v1/auth/me' })).statusCode).toBe(401);
    expect(
      (
        await built.app.inject({
          method: 'GET',
          url: '/v1/auth/me',
          headers: { authorization: 'Bearer nonsense' },
        })
      ).statusCode,
    ).toBe(401);
    const me = await built.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { authorization: `Bearer ${tokens.accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().email).toBe('dan@example.com');
  });

  it('logout revokes the refresh token', async () => {
    const { tokens } = await registerUser(built, 'eve@example.com');
    const out = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/logout',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(out.statusCode).toBe(204);
    const r = await built.app.inject({
      method: 'POST',
      url: '/v1/auth/refresh',
      payload: { refreshToken: tokens.refreshToken },
    });
    expect(r.statusCode).toBe(401);
  });
});
