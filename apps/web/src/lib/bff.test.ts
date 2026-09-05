import { describe, expect, it } from 'vitest';
import {
  authCookiesFrom,
  isAllowed,
  isAuthPath,
  isTextualContentType,
  originAllowed,
} from './bff.js';

describe('BFF allowlist', () => {
  it('permits only known API routes and methods', () => {
    expect(isAllowed('POST', 'v1/translate')).toBe(true);
    expect(isAllowed('GET', 'v1/translate')).toBe(false);
    expect(isAllowed('PUT', 'v1/admin/flags/voip')).toBe(false);
    expect(isAllowed('DELETE', 'v1/translations/123e4567-e89b-12d3-a456-426614174000')).toBe(true);
    expect(isAllowed('DELETE', 'v1/translations/../users')).toBe(false);
    expect(isAllowed('GET', 'v1/auth/me')).toBe(true);
    expect(isAllowed('POST', 'v1/auth/password-reset/confirm')).toBe(true);
    expect(isAllowed('GET', 'v1/account/export')).toBe(true);
    expect(isAllowed('DELETE', 'v1/account')).toBe(true);
    expect(isAllowed('GET', 'v1/account')).toBe(false);
  });
  it('identifies auth endpoints', () => {
    expect(isAuthPath('v1/auth/login')).toBe('login');
    expect(isAuthPath('v1/translate')).toBeNull();
  });
});

describe('CSRF origin check', () => {
  it('allows same-host mutations and GETs; blocks cross-site or missing origin', () => {
    expect(originAllowed('GET', null, null, 'app.voxeli.app')).toBe(true);
    expect(originAllowed('POST', 'https://app.voxeli.app', null, 'app.voxeli.app')).toBe(true);
    expect(originAllowed('POST', null, 'https://app.voxeli.app/translate', 'app.voxeli.app')).toBe(
      true,
    );
    expect(originAllowed('POST', 'https://evil.example', null, 'app.voxeli.app')).toBe(false);
    expect(originAllowed('POST', null, null, 'app.voxeli.app')).toBe(false);
    expect(originAllowed('POST', 'not a url', null, 'app.voxeli.app')).toBe(false);
  });
});

describe('auth cookies', () => {
  it('derives max-age from token expiry and never negative', () => {
    const now = Date.parse('2026-09-05T00:00:00Z');
    const c = authCookiesFrom(
      {
        accessToken: 'a',
        accessTokenExpiresAt: '2026-09-05T00:15:00Z',
        refreshToken: 'r',
        refreshTokenExpiresAt: '2026-08-01T00:00:00Z',
      },
      now,
    );
    expect(c[0]).toMatchObject({ name: 'voxeli_at', maxAgeSeconds: 900 });
    expect(c[1]?.maxAgeSeconds).toBe(0);
  });
});

describe('content-type routing', () => {
  it('treats JSON and text as textual, audio and binary as pass-through', () => {
    expect(isTextualContentType('application/json')).toBe(true);
    expect(isTextualContentType('application/json; charset=utf-8')).toBe(true);
    expect(isTextualContentType('application/problem+json')).toBe(true);
    expect(isTextualContentType('text/plain')).toBe(true);
    expect(isTextualContentType(null)).toBe(true);
    expect(isTextualContentType('audio/mpeg')).toBe(false);
    expect(isTextualContentType('audio/L16;rate=24000')).toBe(false);
    expect(isTextualContentType('application/octet-stream')).toBe(false);
  });
  it('allows the speech endpoint only as POST', () => {
    expect(isAllowed('POST', 'v1/speech')).toBe(true);
    expect(isAllowed('GET', 'v1/speech')).toBe(false);
  });
});
