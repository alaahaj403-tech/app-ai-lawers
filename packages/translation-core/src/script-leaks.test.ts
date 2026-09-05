import { describe, expect, it } from 'vitest';
import { REGRESSION_CASES } from './fixtures/regression.js';
import { detectScriptLeaks, scriptOf } from './script-leaks.js';

describe('scriptOf', () => {
  it('resolves a primary subtag, with or without a region', () => {
    expect(scriptOf('he')).toBe('Hebrew');
    expect(scriptOf('he-IL')).toBe('Hebrew');
    expect(scriptOf('ar_EG')).toBe('Arabic');
    expect(scriptOf('EN-us')).toBe('Latin');
  });
  it('returns undefined for a tag we do not claim to know', () => {
    expect(scriptOf('zh')).toBeUndefined();
    expect(scriptOf('')).toBeUndefined();
  });
});

describe('detectScriptLeaks', () => {
  // Verbatim provider outputs captured from an evaluation run against OpenAI.
  // Frozen here so the three known defects stay covered at zero provider cost.
  it('flags an Arabic currency word left in Hebrew output', () => {
    expect(
      detectScriptLeaks('הסכום הוא ٣٤٥٠ شيكل', { sourceLanguage: 'ar', targetLanguage: 'he' }),
    ).toEqual(['شيكل']);
  });
  it('flags a Hebrew acronym left in English output', () => {
    expect(
      detectScriptLeaks('The price is 1,250 ש"ח including VAT.', {
        sourceLanguage: 'he',
        targetLanguage: 'en',
      }),
    ).toEqual(['ש"ח']);
  });
  it('accepts the same case translated correctly', () => {
    expect(
      detectScriptLeaks('הסכום הוא ٣٤٥٠ ש״ח', { sourceLanguage: 'ar', targetLanguage: 'he' }),
    ).toEqual([]);
    expect(
      detectScriptLeaks('The price is 1,250 NIS, including VAT.', {
        sourceLanguage: 'he',
        targetLanguage: 'en',
      }),
    ).toEqual([]);
  });

  it('never flags preserved Arabic-Indic numerals — they are not letters', () => {
    expect(
      detectScriptLeaks('הסכום הוא ٣٤٥٠ ש״ח', { sourceLanguage: 'ar', targetLanguage: 'he' }),
    ).toEqual([]);
  });
  it('never flags a URL, an email address or a product identifier', () => {
    expect(
      detectScriptLeaks(
        'הדוקומנטציה בכתובת https://voxeli.app/docs/v2 ובמייל support@voxeli.app.',
        {
          sourceLanguage: 'en',
          targetLanguage: 'he',
        },
      ),
    ).toEqual([]);
    expect(
      detectScriptLeaks('Заказ AB-12345X отправлен, трек-номер: 7788990011.', {
        sourceLanguage: 'en',
        targetLanguage: 'ru',
      }),
    ).toEqual([]);
  });
  it('does not check language pairs that share a script', () => {
    expect(
      detectScriptLeaks('Die deadline ist der 2026-10-01.', {
        sourceLanguage: 'en',
        targetLanguage: 'de',
      }),
    ).toEqual([]);
  });
  it('stays silent when either language is unknown to it', () => {
    expect(detectScriptLeaks('שלום world', { sourceLanguage: 'he', targetLanguage: 'zh' })).toEqual(
      [],
    );
  });
  it('ignores single letters and reports each distinct word once', () => {
    expect(
      detectScriptLeaks('Total: ש 1,250 ש"ח and ש"ח again.', {
        sourceLanguage: 'he',
        targetLanguage: 'en',
      }),
    ).toEqual(['ש"ח']);
  });
  it('flags a whole untranslated clause, not just one word', () => {
    expect(
      detectScriptLeaks('The meeting is on 14/09/2026 في الساعة 10:30.', {
        sourceLanguage: 'ar',
        targetLanguage: 'en',
      }),
    ).toEqual(['في', 'الساعة']);
  });

  it('covers the cross-script half of the regression corpus', () => {
    const crossScript = REGRESSION_CASES.filter(
      (c) => scriptOf(c.sourceLanguage) !== scriptOf(c.targetLanguage),
    );
    // Pins the coverage claim: 7 of the 10 cases translate between scripts and
    // are therefore checkable. Fails loudly if a fixture or the language table
    // changes in a way that silently narrows the check.
    expect(crossScript.map((c) => c.id)).toEqual([
      'en-he-phone',
      'he-en-money',
      'ar-en-date',
      'ar-he-arabic-indic',
      'en-ru-identifier',
      'he-ar-conv',
      'en-he-negation',
    ]);
    // A source text is by definition entirely in the source script, so every one
    // of them must flag when handed back as if it were the translation.
    for (const c of crossScript) {
      expect(detectScriptLeaks(c.source, c).length, `${c.id} source should flag`).toBeGreaterThan(
        0,
      );
    }
  });
});
