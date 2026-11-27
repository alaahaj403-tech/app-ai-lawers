/**
 * Protected-entity extraction and verification.
 *
 * Translation must never corrupt numbers, money, dates, phone numbers, URLs,
 * emails, or product identifiers. We do not trust the model to self-report
 * this; we extract entities from the source and verify each one survives in
 * the output (allowing legitimate numeral-system and separator changes).
 */
export type EntityKind =
  'url' | 'email' | 'phone' | 'money' | 'date' | 'time' | 'identifier' | 'number';

export interface ProtectedEntity {
  readonly kind: EntityKind;
  readonly raw: string;
  /** Canonical digits-only (or lowercased) form used for verification. */
  readonly canonical: string;
  /** Offset of `raw` in the text it was extracted from. */
  readonly start: number;
  /** Offset one past the end of `raw`. */
  readonly end: number;
}

// Order matters: more specific first so a phone number is not also counted as several numbers.
const PATTERNS: readonly { kind: EntityKind; re: RegExp }[] = [
  { kind: 'url', re: /\bhttps?:\/\/[^\s<>()"']+|\bwww\.[^\s<>()"']+\b/giu },
  { kind: 'email', re: /\b[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}\b/giu },
  // International / local phone numbers: at least 7 digits with separators.
  {
    kind: 'phone',
    re: /(?:\+|00)?\(?\d{1,4}\)?[\s.-]?\d{2,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{2,4})?(?=\D|$)/gu,
  },
  {
    kind: 'money',
    re: /(?:[$€£₪¥₹]\s?\d[\d,.٫٬]*|\d[\d,.٫٬]*\s?(?:[$€£₪¥₹]|USD|EUR|ILS|NIS|GBP|ש"ח|שח|₪|ريال|درهم|جنيه|دولار|يورو|شيكل))/giu,
  },
  { kind: 'date', re: /\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/gu },
  { kind: 'time', re: /\b\d{1,2}:\d{2}(?::\d{2})?\b/gu },
  {
    kind: 'identifier',
    re: /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]{2,}(?:-[A-Z0-9]+)*\b/gu,
  },
  { kind: 'number', re: /\d+(?:[.,]\d+)*/gu },
];

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹';

/** Normalize every digit system we support to ASCII digits. */
export function normalizeDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const a = ARABIC_INDIC.indexOf(ch);
    const e = EXTENDED_ARABIC_INDIC.indexOf(ch);
    out += a >= 0 ? String(a) : e >= 0 ? String(e) : ch;
  }
  return out;
}

function canonicalOf(kind: EntityKind, raw: string): string {
  const ascii = normalizeDigits(raw);
  switch (kind) {
    case 'url':
    case 'email':
      return ascii.toLowerCase().replace(/[.,;:!?]+$/u, '');
    case 'identifier':
      return ascii.toUpperCase();
    case 'phone':
    case 'money':
    case 'date':
    case 'time':
    case 'number':
      return ascii.replace(/\D/gu, '');
  }
}

/** Numbers that translate legitimately as words in most languages (1–10). */
const SMALL_NUMBER_WORDS_OK = new Set(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);

export function extractProtectedEntities(text: string): ProtectedEntity[] {
  const found: ProtectedEntity[] = [];
  const consumed: [number, number][] = [];
  const normalized = normalizeDigits(text);
  const overlaps = (s: number, e: number) => consumed.some(([cs, ce]) => s < ce && e > cs);

  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    for (const m of normalized.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const raw = text.slice(start, end);
      const canonical = canonicalOf(kind, raw);
      if (kind === 'number' && (canonical.length === 0 || SMALL_NUMBER_WORDS_OK.has(canonical)))
        continue;
      if (kind === 'phone' && canonical.length < 7) continue;
      consumed.push([start, end]);
      found.push({ kind, raw, canonical, start, end });
    }
  }
  return found;
}

export interface IntegrityReport {
  readonly protectedEntities: number;
  readonly preservedEntities: number;
  readonly violations: string[];
}

const DATE_RE = /\b\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\b/gu;

/** Order-independent key so 2026-10-01 ↔ 01.10.2026 ↔ 10/01/2026 are all accepted. */
export function dateKey(raw: string): string {
  return normalizeDigits(raw)
    .split(/[./-]/u)
    .map((c) => Number(c))
    .sort((a, b) => a - b)
    .join('/');
}

/**
 * Verify every source entity is present in the output. Numbers are compared
 * digits-only after digit-system normalization, so "1,234.50" ↔ "1.234,50" and
 * "٣٤٥" ↔ "345" are accepted; "345" → "354" is a violation.
 */
export function verifyIntegrity(
  entities: readonly ProtectedEntity[],
  output: string,
): IntegrityReport {
  const asciiOutput = normalizeDigits(output);
  const digitsOnly = asciiOutput.replace(/\D/gu, '');
  const lowered = asciiOutput.toLowerCase();
  const outputDateKeys = new Set([...asciiOutput.matchAll(DATE_RE)].map((m) => dateKey(m[0])));
  const violations: string[] = [];
  let preserved = 0;

  for (const e of entities) {
    let ok: boolean;
    switch (e.kind) {
      case 'url':
      case 'email':
        ok = lowered.includes(e.canonical);
        break;
      case 'identifier':
        ok = asciiOutput.toUpperCase().includes(e.canonical);
        break;
      case 'date':
        ok = outputDateKeys.has(dateKey(e.raw)) || digitsOnly.includes(e.canonical);
        break;
      default:
        ok = e.canonical.length === 0 || digitsOnly.includes(e.canonical);
    }
    if (ok) preserved += 1;
    else violations.push(`${e.kind}:${e.raw}`);
  }
  return { protectedEntities: entities.length, preservedEntities: preserved, violations };
}
