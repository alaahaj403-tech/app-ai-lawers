/**
 * IncrementalSegmenter — turns a stream of transcript deltas into *stable*
 * segments that are safe to translate. We do not wait for whole sentences,
 * but we also do not translate every keystroke: a segment is emitted when a
 * clause boundary is seen, a silence gap elapses, or the buffer grows long.
 */
export interface TranscriptDelta {
  readonly text: string;
  /** Producer timestamp in ms. */
  readonly at: number;
  /** Provider signalled end of an utterance. */
  readonly final?: boolean;
}

export interface Segment {
  readonly id: string;
  readonly text: string;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly reason: 'boundary' | 'silence' | 'length' | 'final';
}

export interface SegmenterOptions {
  /** Emit when no delta arrives for this long (ms). */
  readonly silenceMs: number;
  /** Emit once buffered text reaches this many characters at a soft boundary. */
  readonly softMaxChars: number;
  /** Always emit at this length even without a boundary. */
  readonly hardMaxChars: number;
  /** Minimum characters before a boundary may trigger emission (avoids "Yes." spam translations). */
  readonly minChars: number;
}

export const DEFAULT_SEGMENTER_OPTIONS: SegmenterOptions = {
  silenceMs: 700,
  softMaxChars: 120,
  hardMaxChars: 240,
  minChars: 12,
};

// Sentence/clause terminators across Latin, Hebrew, Arabic, CJK scripts.
const HARD_BOUNDARY = /[.!?؟。！？…]["'”’»)]?\s*$/u;
const SOFT_BOUNDARY = /[,;:،؛、]\s*$/u;

export class IncrementalSegmenter {
  private buffer = '';
  private startedAt: number | null = null;
  private lastAt = 0;
  private counter = 0;

  constructor(private readonly options: SegmenterOptions = DEFAULT_SEGMENTER_OPTIONS) {}

  /** Feed a delta. Returns zero or more segments ready for translation. */
  push(delta: TranscriptDelta): Segment[] {
    const out: Segment[] = [];
    if (this.buffer.length > 0 && delta.at - this.lastAt >= this.options.silenceMs) {
      out.push(this.flush('silence', this.lastAt));
    }
    if (delta.text.length > 0) {
      this.startedAt ??= delta.at;
      this.buffer += delta.text;
    }
    this.lastAt = delta.at;

    const trimmed = this.buffer.trim();
    if (delta.final && trimmed.length > 0) {
      out.push(this.flush('final', delta.at));
    } else if (trimmed.length >= this.options.hardMaxChars) {
      out.push(this.flush('length', delta.at));
    } else if (trimmed.length >= this.options.minChars && HARD_BOUNDARY.test(trimmed)) {
      out.push(this.flush('boundary', delta.at));
    } else if (trimmed.length >= this.options.softMaxChars && SOFT_BOUNDARY.test(trimmed)) {
      out.push(this.flush('boundary', delta.at));
    }
    return out;
  }

  /** Called by a timer when the producer went quiet. */
  tick(now: number): Segment[] {
    if (this.buffer.trim().length > 0 && now - this.lastAt >= this.options.silenceMs) {
      return [this.flush('silence', now)];
    }
    return [];
  }

  /** Pending (unstable) text, for display as a live caption. */
  pending(): string {
    return this.buffer;
  }

  private flush(reason: Segment['reason'], endedAt: number): Segment {
    const text = this.buffer.trim();
    const seg: Segment = {
      id: `seg_${++this.counter}`,
      text,
      startedAt: this.startedAt ?? endedAt,
      endedAt,
      reason,
    };
    this.buffer = '';
    this.startedAt = null;
    return seg;
  }
}
