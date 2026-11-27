'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { UiLocale } from '@voxeli/domain';
import { createTranslator } from '@voxeli/localization';
import { api } from '@/lib/api-client';

type State = 'working' | 'done' | 'failed';

/** Consumes the one-time token from the email link exactly once. */
export function VerifyEmail({ locale, token }: { locale: UiLocale; token: string }) {
  const t = createTranslator(locale);
  const [state, setState] = useState<State>(token ? 'working' : 'failed');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api
      .confirmEmail(token)
      .then(() => {
        if (!cancelled) setState('done');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6"
      role="status"
      aria-live="polite"
    >
      <p className={state === 'failed' ? 'text-danger' : ''}>
        {state === 'working' && t.t('account.verifying')}
        {state === 'done' && t.t('account.verified')}
        {state === 'failed' && t.t('account.verifyFailed')}
      </p>
      <Link href="/" className="text-sm text-accent underline-offset-4 hover:underline">
        {t.t('account.backHome')}
      </Link>
    </div>
  );
}
