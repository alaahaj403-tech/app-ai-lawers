import type { AudioFrame, AudioInputSource, AudioSourceKind } from './audio-source.js';

/**
 * An AudioInputSource fed from outside — a WebSocket, a VoIP leg, a file
 * reader. Frames are buffered until the consumer asks for them, so a fast
 * producer never blocks and a slow one never busy-waits.
 *
 * `maxBufferedFrames` bounds memory when the consumer stalls: the oldest
 * frames are dropped and counted, so the caller can report degradation
 * instead of silently losing audio.
 */
export class PushAudioSource implements AudioInputSource {
  private readonly queue: AudioFrame[] = [];
  private waiter: ((frame: AudioFrame | null) => void) | null = null;
  private ended = false;
  private droppedFrames = 0;

  constructor(
    readonly sampleRate: number,
    readonly kind: AudioSourceKind = 'microphone',
    private readonly maxBufferedFrames = 250,
  ) {}

  /** Enqueue one frame. Returns false when the frame was dropped by backpressure. */
  push(frame: AudioFrame): boolean {
    if (this.ended) return false;
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter(frame);
      return true;
    }
    this.queue.push(frame);
    if (this.queue.length > this.maxBufferedFrames) {
      this.queue.shift();
      this.droppedFrames += 1;
      return false;
    }
    return true;
  }

  /** Frames dropped because the consumer could not keep up. */
  get dropped(): number {
    return this.droppedFrames;
  }

  get buffered(): number {
    return this.queue.length;
  }

  async *frames(): AsyncIterable<AudioFrame> {
    for (;;) {
      const queued = this.queue.shift();
      if (queued) {
        yield queued;
        continue;
      }
      if (this.ended) return;
      const next = await new Promise<AudioFrame | null>((resolve) => {
        this.waiter = resolve;
      });
      if (next === null) return;
      yield next;
    }
  }

  /** No more frames will arrive; the consumer's loop ends once drained. */
  stop(): void {
    if (this.ended) return;
    this.ended = true;
    const waiter = this.waiter;
    if (waiter) {
      this.waiter = null;
      waiter(null);
    }
  }
}

/** Convert an interleaved little-endian PCM16 byte buffer into a frame. */
export function pcm16FrameFromBytes(
  bytes: Uint8Array,
  sampleRate: number,
  capturedAt: number,
): AudioFrame {
  const usable = bytes.byteLength - (bytes.byteLength % 2);
  const samples = new Int16Array(usable / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, usable);
  for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true);
  return { pcm16: samples, sampleRate, capturedAt };
}
