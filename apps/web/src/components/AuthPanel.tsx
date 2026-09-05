'use client';

import { useEffect, useState } from 'react';
import type React from 'react';
import type { UserProfile } from '@voxeli/api-contracts';
import type { UiLocale } from '@voxeli/domain';
import { createTranslator } from '@voxeli/localization';
import { ApiError, api } from '@/lib/api-client';

type Mode = 'login' | 'register';

export function AuthPanel({ locale }: { locale: UiLocale }) {
  const t = createTranslator(locale);
  const [user, setUser] = useState<UserProfile | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [emailDraft, setEmailDraft] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => {
        setUser(null);
      });
  }, []);

  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const data = new FormData(e.currentTarget);
    const emailField = data.get('email');
    const passwordField = data.get('password');
    const email = typeof emailField === 'string' ? emailField : '';
    const password = typeof passwordField === 'string' ? passwordField : '';
    try {
      const res =
        mode === 'login'
          ? await api.login(email, password)
          : await api.register(email, password, locale);
      setUser(res.user);
      setOpen(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.body.message : t.t('error.generic'));
    } finally {
      setBusy(false);
    }
  }

  if (user === undefined)
    return <div className="h-9 w-24 animate-pulse rounded-md bg-line" aria-hidden />;

  if (user) {
    return (
      <div className="relative flex items-center gap-2 text-sm">
        <span className="hidden max-w-40 truncate text-ink-muted sm:inline bidi-isolate">
          {user.email}
        </span>
        <span className="rounded-full border border-line px-2 py-0.5 text-xs uppercase tracking-wide">
          {user.plan}
        </span>
        <button
          type="button"
          className="rounded-md border border-line bg-panel px-3 py-1.5 hover:border-ink-muted"
          aria-expanded={accountOpen}
          onClick={() => {
            setAccountOpen((o) => !o);
          }}
        >
          {t.t('account.menu')}
        </button>
        {accountOpen && (
          <div className="absolute end-0 top-full z-10 mt-2 flex w-72 flex-col gap-2 rounded-xl border border-line bg-panel p-3 shadow-lg">
            {/* Plain link: the BFF forwards the attachment and the browser saves it. */}
            <a
              href="/api/bff/v1/account/export"
              className="rounded-md px-2 py-1.5 hover:bg-line"
              download="voxeli-export.json"
            >
              {t.t('account.export')}
            </a>
            <button
              type="button"
              className="rounded-md px-2 py-1.5 text-start hover:bg-line"
              onClick={() => {
                void api.logout().finally(() => {
                  setUser(null);
                });
              }}
            >
              {t.t('auth.logout')}
            </button>
            <hr className="border-line" />
            {!deleting ? (
              <button
                type="button"
                className="rounded-md px-2 py-1.5 text-start text-danger hover:bg-line"
                onClick={() => {
                  setDeleting(true);
                }}
              >
                {t.t('account.delete')}
              </button>
            ) : (
              <form
                className="flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const field = new FormData(e.currentTarget).get('password');
                  const password = typeof field === 'string' ? field : '';
                  setBusy(true);
                  setError(null);
                  api
                    .deleteAccount(password)
                    .then(() => {
                      setUser(null);
                      setAccountOpen(false);
                      setDeleting(false);
                    })
                    .catch((err: unknown) => {
                      setError(err instanceof ApiError ? err.body.message : t.t('error.generic'));
                    })
                    .finally(() => {
                      setBusy(false);
                    });
                }}
              >
                <p className="text-xs text-ink-muted">{t.t('account.deleteWarning')}</p>
                <label className="flex flex-col gap-1 text-xs">
                  {t.t('account.deleteConfirm')}
                  <input
                    name="password"
                    type="password"
                    required
                    minLength={10}
                    autoComplete="current-password"
                    dir="ltr"
                    className="rounded-md border border-line bg-paper px-2 py-1.5 text-sm"
                  />
                </label>
                {error && (
                  <p role="alert" className="text-xs text-danger">
                    {error}
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
                  >
                    {t.t('account.delete')}
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-line px-3 py-1.5 text-xs"
                    onClick={() => {
                      setDeleting(false);
                      setError(null);
                    }}
                  >
                    {t.t('account.cancel')}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink"
        onClick={() => {
          setOpen((o) => !o);
        }}
      >
        {t.t('auth.login')}
      </button>
      {open && (
        <form
          onSubmit={(e) => {
            void submit(e);
          }}
          className="absolute end-0 z-10 mt-2 flex w-72 flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-lg"
          aria-label={mode === 'login' ? t.t('auth.login') : t.t('auth.register')}
        >
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className={`flex-1 rounded-md px-2 py-1 ${mode === 'login' ? 'bg-line font-medium' : ''}`}
              onClick={() => {
                setMode('login');
              }}
            >
              {t.t('auth.login')}
            </button>
            <button
              type="button"
              className={`flex-1 rounded-md px-2 py-1 ${mode === 'register' ? 'bg-line font-medium' : ''}`}
              onClick={() => {
                setMode('register');
              }}
            >
              {t.t('auth.register')}
            </button>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            {t.t('auth.email')}
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              dir="ltr"
              value={emailDraft}
              onChange={(e) => {
                setEmailDraft(e.target.value);
              }}
              className="rounded-md border border-line bg-paper px-2 py-1.5"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            {t.t('auth.password')}
            <input
              name="password"
              type="password"
              required
              minLength={10}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              dir="ltr"
              className="rounded-md border border-line bg-paper px-2 py-1.5"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-ink-muted">
              {notice}
            </p>
          )}
          {mode === 'login' && (
            <button
              type="button"
              className="self-start text-xs text-accent underline-offset-4 hover:underline disabled:opacity-60"
              disabled={!emailDraft.includes('@') || busy}
              onClick={() => {
                // Same response whether or not the account exists (no enumeration).
                void api.requestPasswordReset(emailDraft).finally(() => {
                  setNotice(t.t('account.forgotSent'));
                });
              }}
            >
              {t.t('account.forgot')}
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-ink disabled:opacity-60"
          >
            {mode === 'login' ? t.t('auth.login') : t.t('auth.register')}
          </button>
        </form>
      )}
    </div>
  );
}
