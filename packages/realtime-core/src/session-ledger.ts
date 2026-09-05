/**
 * SessionLedger — the source of truth for a live session's confirmed segments.
 * Survives reconnects: confirmed segments are never lost, never duplicated, and
 * the original transcript is never overwritten by a translation.
 */
export interface LedgerEntry {
  readonly id: string;
  readonly speaker: string | null;
  readonly sourceLanguage: string;
  readonly original: string;
  readonly translated: string | null;
  readonly startedAt: number;
  readonly endedAt: number;
}

export class SessionLedger {
  private readonly entries: LedgerEntry[] = [];
  private readonly seen = new Set<string>();

  /** Add a confirmed original segment. Returns false when it was a duplicate. */
  confirm(entry: Omit<LedgerEntry, 'translated'>): boolean {
    const key = entry.id || fingerprint(entry.original, entry.startedAt);
    if (this.seen.has(key)) return false;
    this.seen.add(key);
    this.entries.push({ ...entry, translated: null });
    return true;
  }

  /** Attach a translation to a confirmed segment. The original is untouched. */
  attachTranslation(id: string, translated: string): boolean {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    const prev = this.entries[idx];
    if (!prev) return false;
    this.entries[idx] = { ...prev, translated };
    return true;
  }

  /** Segments a reconnecting client already has can be skipped by the server. */
  lastConfirmedId(): string | null {
    return this.entries[this.entries.length - 1]?.id ?? null;
  }

  since(id: string | null): readonly LedgerEntry[] {
    if (id === null) return this.all();
    const idx = this.entries.findIndex((e) => e.id === id);
    return idx < 0 ? this.all() : this.entries.slice(idx + 1);
  }

  all(): readonly LedgerEntry[] {
    return [...this.entries];
  }
}

export function fingerprint(text: string, at: number): string {
  let h = 0;
  const s = `${Math.floor(at / 250)}|${text.trim().toLowerCase()}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return `fp_${(h >>> 0).toString(16)}`;
}
