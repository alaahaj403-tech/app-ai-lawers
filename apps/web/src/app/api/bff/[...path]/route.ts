import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  authCookiesFrom,
  isAllowed,
  isAuthPath,
  isTextualContentType,
  originAllowed,
} from '@/lib/bff';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const SECURE = process.env.COOKIE_SECURE === 'true';

const cookieBase = { httpOnly: true, sameSite: 'strict' as const, secure: SECURE, path: '/' };

async function handle(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const { path: segments } = await ctx.params;
  const path = segments.join('/');
  const method = req.method.toUpperCase();

  if (!isAllowed(method, path))
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } },
      { status: 404 },
    );
  if (
    !originAllowed(
      method,
      req.headers.get('origin'),
      req.headers.get('referer'),
      req.headers.get('host'),
    )
  ) {
    return NextResponse.json(
      {
        error: {
          code: 'AUTHORIZATION_FAILURE',
          message: 'Cross-site request blocked',
          retryable: false,
        },
      },
      { status: 403 },
    );
  }

  const jar = await cookies();
  const authKind = isAuthPath(path);
  const headers = new Headers({ 'content-type': 'application/json', accept: 'application/json' });
  const correlation = req.headers.get('x-correlation-id');
  if (correlation) headers.set('x-correlation-id', correlation);

  let body: string | undefined =
    method === 'GET' || method === 'HEAD' ? undefined : await req.text();

  if (authKind === 'refresh' || authKind === 'logout') {
    const rt = jar.get(REFRESH_COOKIE)?.value;
    body = JSON.stringify(rt ? { refreshToken: rt } : {});
  } else {
    const at = jar.get(ACCESS_COOKIE)?.value;
    if (at) headers.set('authorization', `Bearer ${at}`);
  }

  const url = `${API_URL}/${path}${req.nextUrl.search}`;
  let upstream: Response;
  try {
    upstream = await fetch(url, { method, headers, body, cache: 'no-store' });
  } catch {
    return NextResponse.json(
      { error: { code: 'NETWORK_FAILURE', message: 'API unreachable', retryable: true } },
      { status: 502 },
    );
  }

  const upstreamContentType = upstream.headers.get('content-type');
  const correlationOut = upstream.headers.get('x-correlation-id');

  if (!isTextualContentType(upstreamContentType)) {
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        'content-type': upstreamContentType ?? 'application/octet-stream',
        'cache-control': 'private, no-store',
        ...(correlationOut ? { 'x-correlation-id': correlationOut } : {}),
      },
    });
  }

  const text = await upstream.text();
  const res = new NextResponse(text.length ? text : null, {
    status: upstream.status,
    headers: {
      'content-type': upstream.headers.get('content-type') ?? 'application/json',
      ...(correlationOut ? { 'x-correlation-id': correlationOut } : {}),
    },
  });

  if (authKind && upstream.ok) {
    if (authKind === 'logout') {
      res.cookies.set({ ...cookieBase, name: ACCESS_COOKIE, value: '', maxAge: 0 });
      res.cookies.set({ ...cookieBase, name: REFRESH_COOKIE, value: '', maxAge: 0 });
    } else {
      try {
        const parsed = JSON.parse(text) as { tokens?: Parameters<typeof authCookiesFrom>[0] };
        if (parsed.tokens) {
          for (const c of authCookiesFrom(parsed.tokens))
            res.cookies.set({
              ...cookieBase,
              name: c.name,
              value: c.value,
              maxAge: c.maxAgeSeconds,
            });
          // Tokens never reach the browser.
          const { tokens: _tokens, ...rest } = parsed as Record<string, unknown>;
          return withCookies(NextResponse.json(rest, { status: upstream.status }), res);
        }
      } catch {
        /* fall through: return upstream body unchanged */
      }
    }
  }
  return res;
}

function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const c of source.cookies.getAll()) target.cookies.set(c);
  return target;
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
export const DELETE = handle;
