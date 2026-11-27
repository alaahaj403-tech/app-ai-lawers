/**
 * Controlled regression fixtures. Each case lists the entities that MUST survive
 * translation. The suite is provider-agnostic: it validates the integrity layer
 * and is reused by the AI evaluation harness against real providers.
 */
export interface RegressionCase {
  readonly id: string;
  readonly source: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly mustPreserve: readonly string[];
  readonly category:
    | 'conversation'
    | 'travel'
    | 'business'
    | 'technical'
    | 'slang'
    | 'dates'
    | 'phone'
    | 'currency'
    | 'legal';
}

export const REGRESSION_CASES: readonly RegressionCase[] = [
  {
    id: 'en-he-phone',
    category: 'phone',
    sourceLanguage: 'en',
    targetLanguage: 'he',
    source: 'Call me at +972-52-123-4567 tomorrow.',
    mustPreserve: ['972521234567'],
  },
  {
    id: 'he-en-money',
    category: 'currency',
    sourceLanguage: 'he',
    targetLanguage: 'en',
    source: 'המחיר הוא 1,250 ש"ח כולל מע"מ.',
    mustPreserve: ['1250'],
  },
  {
    id: 'ar-en-date',
    category: 'dates',
    sourceLanguage: 'ar',
    targetLanguage: 'en',
    source: 'الاجتماع يوم 14/09/2026 في الساعة 10:30.',
    mustPreserve: ['14092026', '1030'],
  },
  {
    id: 'ar-he-arabic-indic',
    category: 'currency',
    sourceLanguage: 'ar',
    targetLanguage: 'he',
    source: 'المبلغ ٣٤٥٠ شيكل',
    mustPreserve: ['3450'],
  },
  {
    id: 'en-de-url',
    category: 'technical',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    source: 'Docs live at https://voxeli.app/docs/v2 and support@voxeli.app.',
    mustPreserve: ['https://voxeli.app/docs/v2', 'support@voxeli.app'],
  },
  {
    id: 'en-ru-identifier',
    category: 'technical',
    sourceLanguage: 'en',
    targetLanguage: 'ru',
    source: 'Order AB-12345X ships with tracking 7788990011.',
    mustPreserve: ['AB-12345X', '7788990011'],
  },
  {
    id: 'en-es-business',
    category: 'business',
    sourceLanguage: 'en',
    targetLanguage: 'es',
    source: 'We agreed on €4,999.00 payable within 30 days.',
    mustPreserve: ['499900', '30'],
  },
  {
    id: 'en-fr-legal',
    category: 'legal',
    sourceLanguage: 'en',
    targetLanguage: 'fr',
    source: 'Pursuant to Section 12(b), the deadline is 2026-10-01.',
    mustPreserve: ['12', '20261001'],
  },
  {
    id: 'he-ar-conv',
    category: 'conversation',
    sourceLanguage: 'he',
    targetLanguage: 'ar',
    source: 'נפגשים ב-17:45 ליד שער 3.',
    mustPreserve: ['1745'],
  },
  {
    id: 'en-he-negation',
    category: 'conversation',
    sourceLanguage: 'en',
    targetLanguage: 'he',
    source: 'I did not receive invoice 2043.',
    mustPreserve: ['2043'],
  },
];
