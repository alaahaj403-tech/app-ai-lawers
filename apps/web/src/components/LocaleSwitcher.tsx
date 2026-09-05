'use client';

import { useRouter } from 'next/navigation';
import { UI_LOCALES, getLanguage } from '@voxeli/domain';
import type { UiLocale } from '@voxeli/domain';

export function LocaleSwitcher({ current }: { current: UiLocale }) {
  const router = useRouter();
  return (
    <label className="text-sm">
      <span className="sr-only">UI language</span>
      <select
        className="rounded-md border border-line bg-panel px-2 py-1.5 text-sm"
        value={current}
        onChange={(e) => {
          document.cookie = `voxeli_locale=${e.target.value}; path=/; max-age=31536000; samesite=strict`;
          router.refresh();
        }}
      >
        {UI_LOCALES.map((l) => (
          <option key={l} value={l}>
            {getLanguage(l)?.nativeName ?? l}
          </option>
        ))}
      </select>
    </label>
  );
}
