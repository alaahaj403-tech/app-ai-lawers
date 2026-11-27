import { cookies, headers } from 'next/headers';
import { UI_LOCALES, isUiLocale } from '@voxeli/domain';
import type { UiLocale } from '@voxeli/domain';

export const LOCALE_COOKIE = 'voxeli_locale';

/** Server-side locale resolution: explicit cookie → Accept-Language → English. */
export async function resolveLocale(): Promise<UiLocale> {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (fromCookie && isUiLocale(fromCookie)) return fromCookie;
  const accept = (await headers()).get('accept-language') ?? '';
  for (const part of accept.split(',')) {
    const tag = part.split(';')[0]?.trim().toLowerCase().split('-')[0];
    if (tag && isUiLocale(tag)) return tag;
  }
  return UI_LOCALES[0];
}
