import { describe, expect, it } from 'vitest';
import { ResendEmailProvider } from '../src/modules/email/provider.js';

function fakeFetch(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = ((url: string | URL | Request, init?: RequestInit) => {
    const href = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    calls.push({ url: href, init: init ?? {} });
    return Promise.resolve(new Response(JSON.stringify({ id: 'em_1' }), { status }));
  }) as typeof fetch;
  return { f, calls };
}

describe('ResendEmailProvider', () => {
  it('posts the documented payload with a bearer key and an idempotency key', async () => {
    const { f, calls } = fakeFetch(200);
    const p = new ResendEmailProvider('re_test', 'Voxeli <no-reply@voxeli.app>', f);
    await p.send({ to: 'a@b.co', subject: 'Hi', text: 'Body' }, 'corr-1');
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test');
    expect(headers['Idempotency-Key']).toBe('corr-1');
    const body = calls[0]?.init.body;
    expect(JSON.parse(typeof body === 'string' ? body : '{}')).toEqual({
      from: 'Voxeli <no-reply@voxeli.app>',
      to: ['a@b.co'],
      subject: 'Hi',
      text: 'Body',
    });
  });

  it('maps provider failures to typed errors without leaking the key', async () => {
    const unauthorized = new ResendEmailProvider('re_secret', 'x <x@x.co>', fakeFetch(401).f);
    await expect(
      unauthorized.send({ to: 'a@b.co', subject: 's', text: 't' }, 'c'),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
    const down = new ResendEmailProvider('re_secret', 'x <x@x.co>', fakeFetch(503).f);
    await expect(down.send({ to: 'a@b.co', subject: 's', text: 't' }, 'c')).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
  });
});
