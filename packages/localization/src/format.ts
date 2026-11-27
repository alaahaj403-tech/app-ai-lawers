import type { UiLocale } from '@voxeli/domain';

const LOCALE_TAGS: Record<UiLocale, string> = {
  en: 'en-US',
  he: 'he-IL',
  ar: 'ar',
  de: 'de-DE',
  ru: 'ru-RU',
  fr: 'fr-FR',
  es: 'es-ES',
};

export function formatNumber(locale: UiLocale, n: number, opts?: Intl.NumberFormatOptions): string {
  return new Intl.NumberFormat(LOCALE_TAGS[locale], opts).format(n);
}

export function formatDate(
  locale: UiLocale,
  d: Date,
  opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' },
): string {
  return new Intl.DateTimeFormat(LOCALE_TAGS[locale], opts).format(d);
}

export function formatDuration(locale: UiLocale, totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const two = (n: number) =>
    formatNumber(locale, n, { minimumIntegerDigits: 2, useGrouping: false });
  return h > 0 ? `${formatNumber(locale, h)}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

export function pluralCategory(locale: UiLocale, n: number): Intl.LDMLPluralRule {
  return new Intl.PluralRules(LOCALE_TAGS[locale]).select(n);
}
