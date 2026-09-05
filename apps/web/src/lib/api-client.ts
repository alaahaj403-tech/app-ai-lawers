'use client';

import type {
  AuthResponse,
  TranslateRequest,
  TranslateResponse,
  TranslationHistoryPage,
  UserProfile,
} from '@voxeli/api-contracts';

export interface ApiErrorBody {
  error: { code: string; message: string; retryable: boolean; correlationId?: string };
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiErrorBody['error'],
  ) {
    super(body.message);
  }
}

async function call<T>(
  method: string,
  path: string,
  payload?: unknown,
  retryOn401 = true,
): Promise<T> {
  const res = await fetch(`/api/bff/${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (res.status === 401 && retryOn401 && path !== 'v1/auth/refresh') {
    const refreshed = await fetch('/api/bff/v1/auth/refresh', { method: 'POST' });
    if (refreshed.ok) return call<T>(method, path, payload, false);
  }
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => null)) as T | ApiErrorBody | null;
  if (!res.ok) {
    const err =
      json && typeof json === 'object' && 'error' in json
        ? json.error
        : { code: 'INTERNAL', message: 'Request failed', retryable: false };
    throw new ApiError(res.status, err);
  }
  return json as T;
}

/** Returns synthesized audio bytes. Binary, so it bypasses the JSON helper. */
async function speech(text: string, language: string, retryOn401 = true): Promise<Blob> {
  const res = await fetch('/api/bff/v1/speech', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text, language, format: 'mp3' }),
  });
  if (res.status === 401 && retryOn401) {
    const refreshed = await fetch('/api/bff/v1/auth/refresh', { method: 'POST' });
    if (refreshed.ok) return speech(text, language, false);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.error ?? { code: 'INTERNAL', message: 'Speech failed', retryable: false },
    );
  }
  return res.blob();
}

export const api = {
  speech,
  me: () => call<UserProfile>('GET', 'v1/auth/me'),
  register: (email: string, password: string, locale: string) =>
    call<Omit<AuthResponse, 'tokens'>>('POST', 'v1/auth/register', { email, password, locale }),
  login: (email: string, password: string) =>
    call<Omit<AuthResponse, 'tokens'>>('POST', 'v1/auth/login', { email, password }),
  logout: () => call<undefined>('POST', 'v1/auth/logout'),
  translate: (req: TranslateRequest) => call<TranslateResponse>('POST', 'v1/translate', req),
  history: (limit = 20) => call<TranslationHistoryPage>('GET', `v1/translations?limit=${limit}`),
  favorite: (id: string, favorite: boolean) =>
    call<{ ok: boolean }>('PATCH', `v1/translations/${id}`, { favorite }),
  remove: (id: string) => call<undefined>('DELETE', `v1/translations/${id}`),
};
