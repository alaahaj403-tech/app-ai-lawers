import { describe, expect, it } from 'vitest';
import {
  extractProtectedEntities,
  normalizeDigits,
  verifyIntegrity,
} from './protected-entities.js';
import { REGRESSION_CASES } from './fixtures/regression.js';

describe('normalizeDigits', () => {
  it('maps Arabic-Indic and extended Arabic-Indic digits to ASCII', () => {
    expect(normalizeDigits('٣٤٥٠')).toBe('3450');
    expect(normalizeDigits('۱۲۳')).toBe('123');
    expect(normalizeDigits('abc 12')).toBe('abc 12');
  });
});

describe('extractProtectedEntities', () => {
  it('extracts phone numbers as a single entity', () => {
    const e = extractProtectedEntities('Call +972-52-123-4567 now');
    expect(e.map((x) => x.kind)).toEqual(['phone']);
    expect(e[0]?.canonical).toBe('972521234567');
  });
  it('extracts urls and emails', () => {
    const e = extractProtectedEntities(
      'See https://voxeli.app/docs?x=1 or mail support@voxeli.app.',
    );
    expect(e.map((x) => x.kind).sort()).toEqual(['email', 'url']);
    expect(e.find((x) => x.kind === 'email')?.canonical).toBe('support@voxeli.app');
  });
  it('extracts money with shekel notation and Arabic-Indic digits', () => {
    expect(
      extractProtectedEntities('המחיר 1,250 ש"ח').some(
        (x) => x.kind === 'money' && x.canonical === '1250',
      ),
    ).toBe(true);
    expect(extractProtectedEntities('المبلغ ٣٤٥٠ شيكل').some((x) => x.canonical === '3450')).toBe(
      true,
    );
  });
  it('extracts product identifiers', () => {
    expect(
      extractProtectedEntities('Order AB-12345X').some(
        (x) => x.kind === 'identifier' && x.canonical === 'AB-12345X',
      ),
    ).toBe(true);
  });
  it('ignores small numbers that legitimately become words', () => {
    expect(extractProtectedEntities('I have 2 cats and 10 dogs')).toHaveLength(0);
    expect(extractProtectedEntities('I have 12 cats')).toHaveLength(1);
  });
});

describe('verifyIntegrity', () => {
  it('accepts locale-formatted numbers and different digit systems', () => {
    const e = extractProtectedEntities('Total €4,999.00 due 2026-10-01');
    expect(verifyIntegrity(e, 'Gesamt 4.999,00 € fällig am 01.10.2026').violations).toEqual([]);
    expect(
      verifyIntegrity(extractProtectedEntities('345 units'), 'عدد الوحدات ٣٤٥').violations,
    ).toEqual([]);
  });
  it('flags corrupted digits', () => {
    const e = extractProtectedEntities('Invoice 2043 for 1,250 ILS');
    const r = verifyIntegrity(e, 'חשבונית 2034 על 1,250 ש"ח');
    expect(r.violations).toEqual(['number:2043']);
    expect(r.preservedEntities).toBe(1);
  });
  it('flags dropped urls but tolerates trailing punctuation and casing', () => {
    const e = extractProtectedEntities('Visit https://Voxeli.app/Docs.');
    expect(verifyIntegrate(e, 'בקרו ב-https://voxeli.app/docs')).toEqual([]);
    expect(verifyIntegrity(e, 'בקרו באתר שלנו').violations).toHaveLength(1);
  });
  it('every regression fixture has its mustPreserve entities extracted', () => {
    for (const c of REGRESSION_CASES) {
      const canon = extractProtectedEntities(c.source).map((e) => e.canonical);
      for (const must of c.mustPreserve) {
        expect(canon, `${c.id} should extract ${must}`).toContain(must);
      }
    }
  });
});

function verifyIntegrate(e: ReturnType<typeof extractProtectedEntities>, out: string) {
  return verifyIntegrity(e, out).violations;
}

describe('dates and times', () => {
  it('accepts reordered date components but rejects changed ones', () => {
    const e = extractProtectedEntities('Deadline 2026-10-01.');
    expect(verifyIntegrity(e, 'תאריך יעד 01.10.2026').violations).toEqual([]);
    expect(verifyIntegrity(e, 'תאריך יעד 01.11.2026').violations).toEqual(['date:2026-10-01']);
  });
  it('extracts clock times as a single entity', () => {
    const e = extractProtectedEntities('at 10:30 and 17:45:10');
    expect(e.map((x) => x.canonical)).toEqual(['1030', '174510']);
  });
});
