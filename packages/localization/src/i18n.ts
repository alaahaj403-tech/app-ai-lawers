import type { UiLocale } from '@voxeli/domain';
import { directionOf } from '@voxeli/domain';
import { formatNumber, pluralCategory } from './format.js';
import { CATALOGS } from './messages/index.js';
import type { Catalog, MessageKey } from './messages/index.js';

export type Params = Record<string, string | number>;

export interface Translator {
  readonly locale: UiLocale;
  readonly dir: 'ltr' | 'rtl';
  t(key: MessageKey, params?: Params): string;
}

export function createTranslator(
  locale: UiLocale,
  catalogs: Record<UiLocale, Catalog> = CATALOGS,
): Translator {
  const catalog = catalogs[locale];
  const fallback = catalogs.en;
  return {
    locale,
    dir: directionOf(locale),
    t(key, params = {}) {
      const entry = catalog[key] ?? fallback[key];
      if (entry === undefined) return key;
      let template: string;
      if (typeof entry === 'string') {
        template = entry;
      } else {
        const count = typeof params.count === 'number' ? params.count : Number(params.count ?? 0);
        template = entry[pluralCategory(locale, count)] ?? entry.other;
      }
      return template.replace(/\{(\w+)\}/gu, (_, name: string) => {
        const v = params[name];
        if (v === undefined) return `{${name}}`;
        return typeof v === 'number' ? formatNumber(locale, v) : v;
      });
    },
  };
}
