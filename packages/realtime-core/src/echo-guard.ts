/**
 * EchoGuard — prevents the interpreter from re-translating its own output.
 * When the device plays translated speech, the microphone (or the far end's
 * mic) may capture it. Transcripts that closely match recently emitted
 * translations are suppressed. Acoustic echo cancellation happens in the audio
 * stack; this is the semantic backstop, and it is regression-tested.
 */
export interface EchoGuardOptions {
  /** How long an emitted translation stays in the suppression window (ms). */
  readonly windowMs: number;
  /** Similarity threshold 0..1 (token overlap, Dice coefficient). */
  readonly threshold: number;
}

export const DEFAULT_ECHO_GUARD: EchoGuardOptions = { windowMs: 8_000, threshold: 0.8 };

export class EchoGuard {
  private readonly recent: { tokens: Set<string>; at: number }[] = [];
  constructor(private readonly options: EchoGuardOptions = DEFAULT_ECHO_GUARD) {}

  /** Register text that the system spoke aloud at time `at`. */
  emitted(text: string, at: number): void {
    this.recent.push({ tokens: tokenize(text), at });
    this.prune(at);
  }

  /** True when the incoming transcript is (probably) the system's own voice. */
  isEcho(transcript: string, at: number): boolean {
    this.prune(at);
    const incoming = tokenize(transcript);
    if (incoming.size === 0) return false;
    return this.recent.some((r) => dice(incoming, r.tokens) >= this.options.threshold);
  }

  private prune(now: number): void {
    while (this.recent.length > 0 && now - (this.recent[0]?.at ?? now) > this.options.windowMs)
      this.recent.shift();
  }
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFKC')
      .replace(/[\p{P}\p{S}]+/gu, ' ')
      .split(/\s+/u)
      .filter((t) => t.length > 0),
  );
}

export function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return (2 * inter) / (a.size + b.size);
}
