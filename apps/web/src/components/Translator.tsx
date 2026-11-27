'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranslateResponse, TranslationHistoryItem } from '@voxeli/api-contracts';
import { TRANSLATION_MODES, directionOf, getLanguage } from '@voxeli/domain';
import type { TranslationMode, UiLocale } from '@voxeli/domain';
import { createTranslator } from '@voxeli/localization';
import { ApiError, api } from '@/lib/api-client';
import { LanguagePicker } from './LanguagePicker';

/**
 * Journey A: open → type → translate. One column, one primary action,
 * reachable with one hand. Everything else is progressively disclosed.
 */
export function Translator({ locale }: { locale: UiLocale }) {
  const t = createTranslator(locale);
  const [source, setSource] = useState('auto');
  const [target, setTarget] = useState(locale === 'en' ? 'he' : 'en');
  const [mode, setMode] = useState<TranslationMode>('natural');
  const [text, setText] = useState('');
  const [saveToHistory, setSaveToHistory] = useState(true);
  const [result, setResult] = useState<TranslateResponse | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<TranslationHistoryItem[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const loadHistory = useCallback(() => {
    api
      .history(10)
      .then((p) => {
        setHistory(p.items);
      })
      .catch(() => {
        setHistory(null);
      });
  }, []);
  useEffect(loadHistory, [loadHistory]);

  async function translate() {
    if (!text.trim() || busy) return;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setBusy(true);
    setError(null);
    try {
      const res = await api.translate({
        text: text.trim(),
        sourceLanguage: source,
        targetLanguage: target,
        mode,
        saveToHistory,
        idempotencyKey: crypto.randomUUID(),
      });
      setResult(res);
      if (saveToHistory) loadHistory();
    } catch (err) {
      if (err instanceof ApiError) {
        const key =
          err.body.code === 'QUOTA_EXCEEDED'
            ? 'error.quota'
            : err.body.code === 'AUTHENTICATION_FAILURE'
              ? 'auth.login'
              : err.body.code === 'NETWORK_FAILURE'
                ? 'error.network'
                : 'error.provider';
        setError({ code: err.body.code, message: t.t(key) });
      } else {
        setError({ code: 'INTERNAL', message: t.t('error.generic') });
      }
    } finally {
      setBusy(false);
    }
  }

  /** Server-side synthesis: one voice pipeline across web and mobile. */
  async function playTranslation() {
    if (!result || speaking) return;
    setSpeaking(true);
    setError(null);
    try {
      const blob = await api.speech(result.result.translatedText, target);
      audioRef.current?.pause();
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.addEventListener('ended', () => {
        URL.revokeObjectURL(url);
      });
      await audio.play();
    } catch (err) {
      setError({
        code: err instanceof ApiError ? err.body.code : 'INTERNAL',
        message:
          err instanceof ApiError && err.body.code === 'QUOTA_EXCEEDED'
            ? t.t('error.quota')
            : t.t('error.provider'),
      });
    } finally {
      setSpeaking(false);
    }
  }

  function swap() {
    if (source === 'auto') {
      const detected = result?.result.detectedLanguage;
      if (!detected) return;
      setSource(target);
      setTarget(detected);
    } else {
      setSource(target);
      setTarget(source);
    }
    if (result) setText(result.result.translatedText);
    setResult(null);
  }

  const translated = result?.result.translatedText ?? '';
  const violations = result?.result.integrity.violations.length ?? 0;
  const sourceDir = source === 'auto' ? 'auto' : directionOf(source);

  return (
    <section className="flex flex-col gap-4" aria-label={t.t('nav.home')}>
      <div className="flex items-end gap-2">
        <LanguagePicker value={source} onChange={setSource} allowAuto label="" autoLabel="Auto" />
        <button
          type="button"
          onClick={swap}
          aria-label={t.t('translate.swap')}
          title={t.t('translate.swap')}
          className="mb-0.5 rounded-lg border border-line bg-panel px-3 py-2 text-lg leading-none hover:border-ink-muted"
        >
          ⇄
        </button>
        <LanguagePicker value={target} onChange={setTarget} label="" />
      </div>

      <div className="rounded-2xl border border-line bg-panel shadow-sm">
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void translate();
          }}
          dir={sourceDir}
          lang={source === 'auto' ? undefined : source}
          placeholder={t.t('translate.sourcePlaceholder')}
          rows={5}
          maxLength={5000}
          className="w-full resize-y rounded-t-2xl bg-transparent px-4 py-3 text-lg leading-relaxed outline-none placeholder:text-ink-muted"
          aria-label={t.t('translate.sourcePlaceholder')}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 py-2">
          <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
            <select
              value={mode}
              onChange={(e) => {
                setMode(e.target.value as TranslationMode);
              }}
              className="rounded-md border border-line bg-paper px-2 py-1 text-xs"
              aria-label="Mode"
            >
              {TRANSLATION_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={!saveToHistory}
                onChange={(e) => {
                  setSaveToHistory(!e.target.checked);
                }}
              />
              {t.t('privacy.noHistory')}
            </label>
            <span className="tabular-nums">{text.length}/5000</span>
          </div>
          <button
            type="button"
            onClick={() => {
              void translate();
            }}
            disabled={busy || !text.trim()}
            className="rounded-lg bg-accent px-5 py-2 text-base font-semibold text-accent-ink disabled:opacity-50"
          >
            {busy ? t.t('state.translating') + '…' : t.t('translate.action')}
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-danger/40 bg-panel px-4 py-3 text-sm text-danger"
        >
          {error.message}
        </div>
      )}

      {result && (
        <article className="rounded-2xl border border-line bg-panel shadow-sm" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-3 text-xs text-ink-muted">
            <span>
              {source === 'auto' &&
                t.t('translate.detected', {
                  language:
                    getLanguage(result.result.detectedLanguage)?.nativeName ??
                    result.result.detectedLanguage,
                })}
            </span>
            <span>{getLanguage(target)?.nativeName}</span>
          </div>
          <p dir={directionOf(target)} lang={target} className="px-4 py-3 text-xl leading-relaxed">
            {translated}
          </p>
          {(violations > 0 || result.routing.degraded) && (
            <div className="mx-4 mb-3 flex flex-col gap-1 rounded-lg border border-warn/40 px-3 py-2 text-xs text-warn">
              {violations > 0 && (
                <span>{t.t('translate.integrityWarning', { count: violations })}</span>
              )}
              {result.routing.degraded && <span>{t.t('translate.degraded')}</span>}
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-t border-line px-3 py-2 text-sm">
            <button
              type="button"
              className="rounded-md border border-line px-3 py-1 hover:border-ink-muted"
              onClick={() => {
                void navigator.clipboard.writeText(translated).then(() => {
                  setCopied(true);
                  setTimeout(() => {
                    setCopied(false);
                  }, 1500);
                });
              }}
            >
              {copied ? '✓' : t.t('translate.copy')}
            </button>
            <button
              type="button"
              disabled={speaking}
              className="rounded-md border border-line px-3 py-1 hover:border-ink-muted disabled:opacity-60"
              onClick={() => {
                void playTranslation();
              }}
            >
              {speaking ? t.t('state.speaking') : t.t('translate.listen')}
            </button>
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                className="rounded-md border border-line px-3 py-1 hover:border-ink-muted"
                onClick={() => void navigator.share({ text: translated }).catch(() => undefined)}
              >
                {t.t('translate.share')}
              </button>
            )}
            {result.id && (
              <button
                type="button"
                className="rounded-md border border-line px-3 py-1 hover:border-ink-muted"
                onClick={() => {
                  if (result.id) void api.favorite(result.id, true).then(loadHistory);
                }}
              >
                {t.t('translate.save')}
              </button>
            )}
            <span className="ms-auto self-center text-xs text-ink-muted tabular-nums">
              {result.quota.limit !== null &&
                t.t('quota.translationsLeft', {
                  count: Math.max(0, result.quota.limit - result.quota.used),
                })}
            </span>
          </div>
          {result.result.alternatives.length > 0 && (
            <details className="border-t border-line px-4 py-2 text-sm">
              <summary className="cursor-pointer text-ink-muted">
                {t.t('translate.alternatives')}
              </summary>
              <ul className="mt-2 flex flex-col gap-2">
                {result.result.alternatives.map((a, i) => (
                  <li key={i} dir={directionOf(target)} lang={target}>
                    {a.text}
                    {a.note && <span className="ms-2 text-xs text-ink-muted">— {a.note}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      )}

      {history && (
        <section aria-label={t.t('history.title')} className="mt-4">
          <h2 className="mb-2 text-sm font-medium text-ink-muted">{t.t('history.title')}</h2>
          {history.length === 0 ? (
            <p className="text-sm text-ink-muted">{t.t('history.empty')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-panel">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p
                      dir={directionOf(h.sourceLanguage)}
                      lang={h.sourceLanguage}
                      className="truncate text-ink-muted"
                    >
                      {h.sourceText}
                    </p>
                    <p
                      dir={directionOf(h.targetLanguage)}
                      lang={h.targetLanguage}
                      className="truncate"
                    >
                      {h.translatedText}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t.t('translate.save')}
                    className={`text-lg leading-none ${h.favorite ? 'text-accent' : 'text-ink-muted'}`}
                    onClick={() => void api.favorite(h.id, !h.favorite).then(loadHistory)}
                  >
                    {h.favorite ? '★' : '☆'}
                  </button>
                  <button
                    type="button"
                    aria-label="Delete"
                    className="text-ink-muted hover:text-danger"
                    onClick={() => void api.remove(h.id).then(loadHistory)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </section>
  );
}
