import { describe, expect, it } from 'vitest';
import { LANGUAGES, directionOf, getLanguage, isRtl, isUiLocale } from './languages.js';

describe('language registry', () => {
  it('has unique codes', () => {
    const codes = LANGUAGES.map((l) => l.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
  it('marks Hebrew, Arabic, Persian, Urdu, Yiddish as RTL', () => {
    for (const c of ['he', 'ar', 'fa', 'ur', 'yi']) expect(isRtl(c)).toBe(true);
    for (const c of ['en', 'de', 'ru', 'ja']) expect(isRtl(c)).toBe(false);
  });
  it('resolves regional variants to primary subtag', () => {
    expect(getLanguage('he-IL')?.code).toBe('he');
    expect(getLanguage('en-US')?.code).toBe('en');
    expect(getLanguage('zh-Hant')?.code).toBe('zh-Hant');
  });
  it('defaults unknown languages to ltr without throwing', () => {
    expect(directionOf('xx')).toBe('ltr');
  });
  it('exposes the seven launch UI locales', () => {
    expect(isUiLocale('he')).toBe(true);
    expect(isUiLocale('ja')).toBe(false);
  });
});
