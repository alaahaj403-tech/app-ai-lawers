import { describe, expect, it } from 'vitest';
import { UI_LOCALES } from '@voxeli/domain';
import { createTranslator } from './i18n.js';
import { CATALOGS, MESSAGE_KEYS } from './messages/index.js';
import { isolate, isolateTechnical } from './bidi.js';
import { formatDuration } from './format.js';

describe('message catalogs', () => {
  it('every locale defines every key and every plural has `other`', () => {
    for (const locale of UI_LOCALES) {
      const cat = CATALOGS[locale];
      for (const key of MESSAGE_KEYS) {
        expect(cat[key], `${locale}:${key}`).toBeDefined();
        const v = cat[key];
        if (typeof v === 'object') expect(v.other).toBeTruthy();
      }
    }
  });
  it('placeholders are consistent with English', () => {
    const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/gu)].map((m) => m[1]).sort();
    for (const locale of UI_LOCALES) {
      for (const key of MESSAGE_KEYS) {
        const en = CATALOGS.en[key];
        const other = CATALOGS[locale][key];
        const enStr = typeof en === 'string' ? en : (en?.other ?? '');
        const otherStr = typeof other === 'string' ? other : (other?.other ?? '');
        expect(ph(otherStr), `${locale}:${key}`).toEqual(ph(enStr));
      }
    }
  });
});

describe('createTranslator', () => {
  it('interpolates and formats numbers per locale', () => {
    expect(createTranslator('en').t('translate.detected', { language: 'Hebrew' })).toBe(
      'Detected: Hebrew',
    );
    expect(createTranslator('de').t('quota.translationsLeft', { count: 1250 })).toBe(
      'Noch 1.250 Übersetzungen diesen Monat',
    );
  });
  it('selects plural categories (Russian few/many, Arabic two, Hebrew one)', () => {
    expect(createTranslator('ru').t('quota.translationsLeft', { count: 3 })).toContain('перевода');
    expect(createTranslator('ru').t('quota.translationsLeft', { count: 5 })).toContain('переводов');
    expect(createTranslator('ar').t('quota.translationsLeft', { count: 2 })).toBe(
      'تبقّت ترجمتان هذا الشهر',
    );
    expect(createTranslator('he').t('quota.translationsLeft', { count: 1 })).toBe(
      'נותר תרגום 1 החודש',
    );
  });
  it('exposes text direction', () => {
    expect(createTranslator('he').dir).toBe('rtl');
    expect(createTranslator('ar').dir).toBe('rtl');
    expect(createTranslator('fr').dir).toBe('ltr');
  });
});

describe('bidi helpers', () => {
  it('isolates without reversing', () => {
    expect(isolate('https://voxeli.app', 'ltr')).toBe('⁦https://voxeli.app⁩');
  });
  it('isolates urls, emails, phones and ids inside Hebrew text', () => {
    const s = isolateTechnical(
      'פרטים ב-https://voxeli.app או support@voxeli.app, טלפון +972-52-123-4567, הזמנה AB-12345X',
    );
    expect(s).toContain('⁦https://voxeli.app⁩');
    expect(s).toContain('⁦support@voxeli.app⁩');
    expect(s).toContain('⁦+972-52-123-4567⁩');
    expect(s).toContain('⁦AB-12345X⁩');
  });
  it('formats durations with two-digit minutes/seconds', () => {
    expect(formatDuration('en', 65)).toBe('01:05');
    expect(formatDuration('en', 3725)).toBe('1:02:05');
  });
});
