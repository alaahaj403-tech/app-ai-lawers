/**
 * LatencyMeter — measures each stage separately. "Fast" is not a metric.
 */
export type LatencyStage =
  | 'capture'
  | 'network'
  | 'recognition'
  | 'translation'
  | 'synthesis'
  | 'playback'
  | 'connection_setup'
  | 'first_transcript'
  | 'first_translation'
  | 'first_audio'
  | 'interruption_response'
  | 'reconnect';

export interface StageStats {
  readonly count: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
  readonly mean: number;
}

export class LatencyMeter {
  private readonly samples = new Map<LatencyStage, number[]>();
  private readonly marks = new Map<string, number>();

  mark(name: string, at: number): void {
    this.marks.set(name, at);
  }

  /** Record the duration between a previous mark and `at` under `stage`. */
  measureFrom(mark: string, stage: LatencyStage, at: number): number | undefined {
    const start = this.marks.get(mark);
    if (start === undefined) return undefined;
    const d = Math.max(0, at - start);
    this.record(stage, d);
    return d;
  }

  record(stage: LatencyStage, ms: number): void {
    const arr = this.samples.get(stage) ?? [];
    arr.push(ms);
    this.samples.set(stage, arr);
  }

  stats(stage: LatencyStage): StageStats | undefined {
    const arr = this.samples.get(stage);
    if (!arr || arr.length === 0) return undefined;
    const sorted = [...arr].sort((a, b) => a - b);
    const q = (p: number) =>
      sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
    return {
      count: sorted.length,
      p50: q(0.5),
      p95: q(0.95),
      max: sorted[sorted.length - 1] ?? 0,
      mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    };
  }

  /** Total perceived delay = sum of stage p50s that lie on the critical path. */
  perceivedDelayP50(): number {
    const path: LatencyStage[] = [
      'capture',
      'network',
      'recognition',
      'translation',
      'synthesis',
      'playback',
    ];
    return path.reduce((sum, s) => sum + (this.stats(s)?.p50 ?? 0), 0);
  }

  snapshot(): Partial<Record<LatencyStage, StageStats>> {
    const out: Partial<Record<LatencyStage, StageStats>> = {};
    for (const stage of this.samples.keys()) {
      const st = this.stats(stage);
      if (st) out[stage] = st;
    }
    return out;
  }
}
