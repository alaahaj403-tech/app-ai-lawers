/**
 * Streaming audio abstraction. Source acquisition (microphone, VoIP legs,
 * recordings, uploads) is separated from translation intelligence so new
 * sources can be added without touching the pipeline.
 */
export interface AudioFrame {
  /** Little-endian PCM16 mono samples. */
  readonly pcm16: Int16Array;
  readonly sampleRate: number;
  /** Capture timestamp (ms, monotonic clock of the producer). */
  readonly capturedAt: number;
}

export type AudioSourceKind =
  'microphone' | 'voip_remote' | 'voip_local' | 'live_recording' | 'uploaded' | 'synthetic';

export interface AudioInputSource {
  readonly kind: AudioSourceKind;
  readonly sampleRate: number;
  /** Async iteration of frames until the source ends or is stopped. */
  frames(): AsyncIterable<AudioFrame>;
  stop(): Promise<void> | void;
}

/** Deterministic source used in tests and latency benchmarks. */
export class SyntheticAudioSource implements AudioInputSource {
  readonly kind = 'synthetic' as const;
  private stopped = false;
  constructor(
    readonly sampleRate: number,
    private readonly chunks: readonly Int16Array[],
    private readonly frameMs = 20,
  ) {}
  async *frames(): AsyncIterable<AudioFrame> {
    let t = 0;
    for (const pcm16 of this.chunks) {
      if (this.stopped) return;
      yield { pcm16, sampleRate: this.sampleRate, capturedAt: t };
      t += this.frameMs;
      await Promise.resolve();
    }
  }
  stop(): void {
    this.stopped = true;
  }
}

/** Root-mean-square energy of a frame, used by VAD heuristics. */
export function frameRms(frame: AudioFrame): number {
  if (frame.pcm16.length === 0) return 0;
  let sum = 0;
  for (const s of frame.pcm16) sum += s * s;
  return Math.sqrt(sum / frame.pcm16.length) / 32768;
}
