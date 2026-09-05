import { directionOf } from '@voxeli/domain';
import type { TextDirection } from '@voxeli/domain';

const LRI = '⁦';
const RLI = '⁧';
const FSI = '⁨';
const PDI = '⁩';

/**
 * Wrap a run in Unicode isolates so it renders correctly inside text of the
 * opposite direction. Never reverses characters — that would corrupt URLs,
 * numbers, emails, code and IDs.
 */
export function isolate(text: string, direction: TextDirection | 'auto' = 'auto'): string {
  const open = direction === 'ltr' ? LRI : direction === 'rtl' ? RLI : FSI;
  return `${open}${text}${PDI}`;
}

/** Technical tokens must always be LTR-isolated in RTL paragraphs. */
export function isolateTechnical(text: string): string {
  return text.replace(
    /(https?:\/\/[^\s]+|[\w.+-]+@[\w-]+\.[\w.-]+|\+?\d[\d\s().-]{6,}\d|\b[A-Z0-9]{2,}(?:-[A-Z0-9]+)+\b)/gu,
    (m) => isolate(m, 'ltr'),
  );
}

export function htmlDirAttrs(languageCode: string): { lang: string; dir: TextDirection } {
  return { lang: languageCode, dir: directionOf(languageCode) };
}
