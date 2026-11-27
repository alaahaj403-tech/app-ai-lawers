/**
 * Language registry. Codes are BCP-47 primary subtags (ISO 639-1 where it exists).
 * `direction` drives RTL rendering. Capability flags are the *baseline* for the
 * capability registry; the server may narrow them at runtime (never widen).
 */
export type TextDirection = 'ltr' | 'rtl';

export interface Language {
  readonly code: string;
  readonly englishName: string;
  readonly nativeName: string;
  readonly direction: TextDirection;
  /** Script family, used for entity protection and typography decisions. */
  readonly script:
    | 'Latn'
    | 'Hebr'
    | 'Arab'
    | 'Cyrl'
    | 'Grek'
    | 'Hans'
    | 'Hant'
    | 'Jpan'
    | 'Kore'
    | 'Deva'
    | 'Thai'
    | 'Other';
}

export const AUTO_DETECT = 'auto' as const;
/** A language code from the registry, or 'auto' for detection. */
export type SourceLanguageCode = string;

const L = (
  code: string,
  englishName: string,
  nativeName: string,
  direction: TextDirection,
  script: Language['script'],
): Language => ({ code, englishName, nativeName, direction, script });

/** Launch languages: UI + translation. Ordered by product priority. */
export const LANGUAGES: readonly Language[] = [
  L('en', 'English', 'English', 'ltr', 'Latn'),
  L('he', 'Hebrew', 'עברית', 'rtl', 'Hebr'),
  L('ar', 'Arabic', 'العربية', 'rtl', 'Arab'),
  L('de', 'German', 'Deutsch', 'ltr', 'Latn'),
  L('ru', 'Russian', 'Русский', 'ltr', 'Cyrl'),
  L('fr', 'French', 'Français', 'ltr', 'Latn'),
  L('es', 'Spanish', 'Español', 'ltr', 'Latn'),
  L('pt', 'Portuguese', 'Português', 'ltr', 'Latn'),
  L('it', 'Italian', 'Italiano', 'ltr', 'Latn'),
  L('tr', 'Turkish', 'Türkçe', 'ltr', 'Latn'),
  L('uk', 'Ukrainian', 'Українська', 'ltr', 'Cyrl'),
  L('pl', 'Polish', 'Polski', 'ltr', 'Latn'),
  L('nl', 'Dutch', 'Nederlands', 'ltr', 'Latn'),
  L('el', 'Greek', 'Ελληνικά', 'ltr', 'Grek'),
  L('ro', 'Romanian', 'Română', 'ltr', 'Latn'),
  L('hu', 'Hungarian', 'Magyar', 'ltr', 'Latn'),
  L('cs', 'Czech', 'Čeština', 'ltr', 'Latn'),
  L('sv', 'Swedish', 'Svenska', 'ltr', 'Latn'),
  L('da', 'Danish', 'Dansk', 'ltr', 'Latn'),
  L('fi', 'Finnish', 'Suomi', 'ltr', 'Latn'),
  L('no', 'Norwegian', 'Norsk', 'ltr', 'Latn'),
  L('fa', 'Persian', 'فارسی', 'rtl', 'Arab'),
  L('ur', 'Urdu', 'اردو', 'rtl', 'Arab'),
  L('hi', 'Hindi', 'हिन्दी', 'ltr', 'Deva'),
  L('bn', 'Bengali', 'বাংলা', 'ltr', 'Other'),
  L('th', 'Thai', 'ไทย', 'ltr', 'Thai'),
  L('vi', 'Vietnamese', 'Tiếng Việt', 'ltr', 'Latn'),
  L('id', 'Indonesian', 'Bahasa Indonesia', 'ltr', 'Latn'),
  L('ms', 'Malay', 'Bahasa Melayu', 'ltr', 'Latn'),
  L('tl', 'Filipino', 'Filipino', 'ltr', 'Latn'),
  L('zh', 'Chinese (Simplified)', '简体中文', 'ltr', 'Hans'),
  L('zh-Hant', 'Chinese (Traditional)', '繁體中文', 'ltr', 'Hant'),
  L('ja', 'Japanese', '日本語', 'ltr', 'Jpan'),
  L('ko', 'Korean', '한국어', 'ltr', 'Kore'),
  L('am', 'Amharic', 'አማርኛ', 'ltr', 'Other'),
  L('sw', 'Swahili', 'Kiswahili', 'ltr', 'Latn'),
  L('yi', 'Yiddish', 'ייִדיש', 'rtl', 'Hebr'),
];

const BY_CODE: ReadonlyMap<string, Language> = new Map(LANGUAGES.map((l) => [l.code, l]));

export function getLanguage(code: string): Language | undefined {
  return BY_CODE.get(code) ?? BY_CODE.get(code.split('-')[0] ?? '');
}

export function isSupportedLanguage(code: string): boolean {
  return BY_CODE.has(code);
}

export function isRtl(code: string): boolean {
  return getLanguage(code)?.direction === 'rtl';
}

export function directionOf(code: string): TextDirection {
  return getLanguage(code)?.direction ?? 'ltr';
}

/** UI locales shipped in the first release. */
export const UI_LOCALES = ['en', 'he', 'ar', 'de', 'ru', 'fr', 'es'] as const;
export type UiLocale = (typeof UI_LOCALES)[number];
export function isUiLocale(value: string): value is UiLocale {
  return (UI_LOCALES as readonly string[]).includes(value);
}
