import { describe, expect, it } from 'vitest';
import { PushAudioSource, pcm16FrameFromBytes } from './push-source.js';

const frame = (n: number) => ({ pcm16: new Int16Array([n]), sampleRate: 24000, capturedAt: n });

async function take(source: PushAudioSource, count: number) {
  const out: number[] = [];
  for await (const f of source.frames()) {
    out.push(f.pcm16[0] ?? -1);
    if (out.length === count) break;
  }
  return out;
}

describe('PushAudioSource', () => {
  it('delivers frames pushed before consumption', async () => {
    const s = new PushAudioSource(24000);
    s.push(frame(1));
    s.push(frame(2));
    s.stop();
    expect(await take(s, 2)).toEqual([1, 2]);
  });

  it('delivers frames pushed while the consumer is waiting', async () => {
    const s = new PushAudioSource(24000);
    const collected = take(s, 2);
    s.push(frame(7));
    s.push(frame(8));
    expect(await collected).toEqual([7, 8]);
  });

  it('ends the iteration on stop, draining what is buffered first', async () => {
    const s = new PushAudioSource(24000);
    s.push(frame(1));
    s.stop();
    const seen: number[] = [];
    for await (const f of s.frames()) seen.push(f.pcm16[0] ?? -1);
    expect(seen).toEqual([1]);
    expect(s.push(frame(2))).toBe(false);
  });

  it('drops the oldest frames under backpressure and counts them', () => {
    const s = new PushAudioSource(24000, 'microphone', 2);
    expect(s.push(frame(1))).toBe(true);
    expect(s.push(frame(2))).toBe(true);
    expect(s.push(frame(3))).toBe(false);
    expect(s.dropped).toBe(1);
    expect(s.buffered).toBe(2);
  });
});

describe('pcm16FrameFromBytes', () => {
  it('decodes little-endian samples and ignores a trailing odd byte', () => {
    const bytes = new Uint8Array([0x01, 0x00, 0xff, 0xff, 0x7f]);
    const f = pcm16FrameFromBytes(bytes, 24000, 5);
    expect(Array.from(f.pcm16)).toEqual([1, -1]);
    expect(f.sampleRate).toBe(24000);
    expect(f.capturedAt).toBe(5);
  });
});
