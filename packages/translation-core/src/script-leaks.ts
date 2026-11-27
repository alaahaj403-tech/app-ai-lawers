import { extractProtectedEntities } from './protected-entities.js';
import type { EntityKind, ProtectedEntity } from './protected-entities.js';

/**
 * Source-script leak detection.
 *
 * A translation that leaves whole words in the source script is broken, not a
 * stylistic variant: a Hebrew reader who receives "شيكل" has not been served.
 * The entity checks in `protected-entities.ts` cannot see this — they only ask
 * whether numbers and identifiers survived, not what language the words around
 * them are in.
 *
 * This is deliberately NOT a quality score. It reports the offending substrings
 * and nothing else, so the caller can show what leaked rather than a number we
 * would have had to invent.
 */
export type TextScript = 'Latin' | 'Hebrew' | 'Arabic' | 'Cyrillic' | 'Greek';

/**
 * Primary-subtag → script. Only languages the product actually advertises are
 * listed; an unknown tag disables the check rather than guessing at it.
 *
 * A Map, not an object literal: language tags arrive from request payloads, and
 * a plain object resolves `constructor` through the prototype chain, handing
 * back a function where the type promises a TextScript.
 */
const LANGUAGE_SCRIPTS = new Map<string, TextScript>(
  Object.entries({
    ar: 'Arabic',
    fa: 'Arabic',
    ur: 'Arabic',
    he: 'Hebrew',
    yi: 'Hebrew',
    ru: 'Cyrillic',
    uk: 'Cyrillic',
    bg: 'Cyrillic',
    sr: 'Cyrillic',
    el: 'Greek',
    cs: 'Latin',
    da: 'Latin',
    de: 'Latin',
    en: 'Latin',
    es: 'Latin',
    fi: 'Latin',
    fr: 'Latin',
    id: 'Latin',
    it: 'Latin',
    nl: 'Latin',
    pl: 'Latin',
    pt: 'Latin',
    ro: 'Latin',
    sv: 'Latin',
    tr: 'Latin',
    vi: 'Latin',
  } as const),
);

/** Resolve a BCP-47 tag to its script. Returns undefined for anything unlisted. */
export function scriptOf(languageTag: string): TextScript | undefined {
  const primary = languageTag.toLowerCase().split(/[-_]/u)[0];
  return primary === undefined ? undefined : LANGUAGE_SCRIPTS.get(primary);
}

/**
 * A word: letters only, so numerals are never scanned. Arabic-Indic digits
 * (٣٤٥٠) carry Script=Arabic, and `ar-he-arabic-indic` preserves them in Hebrew
 * output on purpose — matching \p{L} keeps them out of the scan entirely.
 * Internal apostrophes and the Hebrew geresh/gershayim stay inside the word so
 * an acronym like ש"ח is one run rather than two single letters.
 */
const WORD = /\p{L}+(?:['’׳״"]\p{L}+)*/gu;

const SCRIPT_LETTER: Readonly<Record<TextScript, RegExp>> = {
  Latin: /\p{Script=Latin}/u,
  Hebrew: /\p{Script=Hebrew}/u,
  Arabic: /\p{Script=Arabic}/u,
  Cyrillic: /\p{Script=Cyrillic}/u,
  Greek: /\p{Script=Greek}/u,
};

/**
 * Words shorter than this are ignored. A stray initial or a single
 * transliterated letter is noise; a leaked word is not.
 */
const MIN_WORD_LENGTH = 2;

/**
 * Entity kinds whose letters are legitimately foreign and must never be
 * flagged: a URL, an email address and a product identifier are tokens to
 * preserve verbatim, not prose to translate.
 *
 * Money and the other numeric kinds are deliberately absent. The money pattern
 * absorbs the currency word next to the amount ("٣٤٥٠ شيكل" matches whole), and
 * that word is prose — it has to be translated. Masking it would hide exactly
 * the defect this check exists to find.
 */
const OPAQUE_KINDS: ReadonlySet<EntityKind> = new Set<EntityKind>(['url', 'email', 'identifier']);

export interface ScriptLeakOptions {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  /** Entities already extracted from `text`; extracted here when omitted. */
  readonly entities?: readonly ProtectedEntity[];
}

/**
 * Returns the distinct source-script words left in `text`, in the order they
 * appear. Empty when the two languages share a script, when either tag is
 * unknown, or when nothing leaked.
 *
 * Note what this does NOT do: it says nothing about en→de or en→fr, which share
 * the Latin script. Silence here means "not checked", not "verified clean".
 */
export function detectScriptLeaks(text: string, options: ScriptLeakOptions): string[] {
  const sourceScript = scriptOf(options.sourceLanguage);
  const targetScript = scriptOf(options.targetLanguage);
  if (sourceScript === undefined || targetScript === undefined) return [];
  if (sourceScript === targetScript) return [];

  const entities = options.entities ?? extractProtectedEntities(text);
  const masked = maskOpaqueEntities(text, entities);
  const isSourceLetter = SCRIPT_LETTER[sourceScript];

  const seen = new Set<string>();
  const leaks: string[] = [];
  for (const match of masked.matchAll(WORD)) {
    const word = match[0];
    if (word.length < MIN_WORD_LENGTH || seen.has(word)) continue;
    if (!isSourceLetter.test(word)) continue;
    seen.add(word);
    leaks.push(word);
  }
  return leaks;
}

/** Blank out the spans whose letters must not be judged, preserving offsets. */
function maskOpaqueEntities(text: string, entities: readonly ProtectedEntity[]): string {
  const opaque = entities.filter((e) => OPAQUE_KINDS.has(e.kind));
  if (opaque.length === 0) return text;
  // split('') yields UTF-16 units, the same unit the entity offsets are measured
  // in. Spreading would yield code points and misalign past an astral character.
  const chars = text.split('');
  for (const entity of opaque) {
    for (let i = entity.start; i < entity.end && i < chars.length; i += 1) chars[i] = ' ';
  }
  return chars.join('');
}
