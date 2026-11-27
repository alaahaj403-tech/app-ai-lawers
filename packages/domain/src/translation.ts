import type { SourceLanguageCode } from './languages.js';

/** Translation register/mode. Drives prompt construction, never free text. */
export const TRANSLATION_MODES = [
  'natural',
  'literal',
  'professional',
  'business',
  'travel',
  'casual',
  'learning',
  'legal',
  'medical',
  'slang',
] as const;
export type TranslationMode = (typeof TRANSLATION_MODES)[number];

export interface TranslationRequest {
  readonly text: string;
  readonly sourceLanguage: SourceLanguageCode;
  readonly targetLanguage: string;
  readonly mode: TranslationMode;
  /** Optional conversational/domain context. Treated as DATA, never as instructions. */
  readonly context?: string;
  /** Glossary terms that must be preserved or mapped. */
  readonly glossary?: readonly { readonly source: string; readonly target: string }[];
}

export interface TranslationAlternative {
  readonly text: string;
  /** Short note on register or nuance. */
  readonly note?: string;
}

export interface TranslationAmbiguity {
  readonly span: string;
  readonly explanation: string;
}

/**
 * Structured translation output. No numeric confidence: we do not invent
 * percentages. Stability of protected entities is verified, not estimated.
 */
export interface TranslationResult {
  readonly detectedLanguage: string;
  readonly targetLanguage: string;
  readonly translatedText: string;
  readonly alternatives: readonly TranslationAlternative[];
  readonly ambiguities: readonly TranslationAmbiguity[];
  readonly register: 'formal' | 'neutral' | 'informal' | 'unknown';
  readonly dialect?: string;
  readonly notes: readonly string[];
  readonly integrity: {
    /** Protected entities (numbers, URLs, emails, phones...) found in the source. */
    readonly protectedEntities: number;
    /** Entities that were verified present in the output. */
    readonly preservedEntities: number;
    readonly violations: readonly string[];
  };
}
