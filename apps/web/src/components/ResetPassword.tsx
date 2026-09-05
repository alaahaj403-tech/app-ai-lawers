'use client';

import Link from 'next/link';
import { useState } from 'react';
import type React from 'react';
import type { UiLocale } from '@voxeli/domain';
import { createTranslator } from '@voxeli/localization';
import { api } from '@/lib/api-client';

type State = 'idle' | 'busy' | 'done' | 'failed';

export function ResetPassword({ locale, token }: { locale: UiLocale; token: string }) {
  const t = createTranslator(locale);
  const [state, setState] = useState<State>(token ? 'idle' : 'failed');

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const field = new FormData(e.currentTarget).get('password');
    const password = typeof field === 'string' ? field : '';
    setState('busy');
    try {
      await api.confirmPasswordReset(token, password);
      setState('done');
    } catch {
      setState('failed');
    }
  }

  if (state === 'done' || state === 'failed') {
    return (
      <div
        className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6"
        role="status"
      >
        <p className={state === 'failed' ? 'text-danger' : ''}>
          {state === 'done' ? t.t('account.resetDone') : t.t('account.resetFailed')}
        </p>
        <Link href="/" className="text-sm text-accent underline-offset-4 hover:underline">
          {t.t('account.backHome')}
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        void submit(e);
      }}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-panel p-6"
    >
      <label className="flex flex-col gap-1 text-sm">
        {t.t('account.newPassword')}
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete="new-password"
          dir="ltr"
          className="rounded-md border border-line bg-paper px-3 py-2 text-base"
        />
      </label>
      <button
        type="submit"
        disabled={state === 'busy'}
        className="rounded-lg bg-accent px-4 py-2 font-semibold text-accent-ink disabled:opacity-60"
      >
        {t.t('account.resetAction')}
      </button>
    </form>
  );
}
