'use client';

import { LANGUAGES } from '@voxeli/domain';

export function LanguagePicker({
  value,
  onChange,
  allowAuto,
  label,
  autoLabel,
}: {
  value: string;
  onChange: (code: string) => void;
  allowAuto?: boolean;
  label: string;
  autoLabel?: string;
}) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-ink-muted">
      {label}
      <select
        className="w-full truncate rounded-lg border border-line bg-panel px-3 py-2 text-base text-ink"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
        }}
      >
        {allowAuto && <option value="auto">{autoLabel ?? 'Auto'}</option>}
        {LANGUAGES.map((l) => (
          // Native name first; the English name only when it differs, so narrow
          // selects on phones do not clip the label the user actually reads.
          <option key={l.code} value={l.code}>
            {l.nativeName === l.englishName ? l.nativeName : `${l.nativeName} (${l.englishName})`}
          </option>
        ))}
      </select>
    </label>
  );
}
