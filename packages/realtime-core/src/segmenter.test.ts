import { describe, expect, it } from 'vitest';
import { IncrementalSegmenter } from './segmenter.js';

describe('IncrementalSegmenter', () => {
  it('emits on a sentence boundary once minimum length is reached', () => {
    const s = new IncrementalSegmenter();
    expect(s.push({ text: 'Yes.', at: 0 })).toEqual([]); // too short to be worth a round-trip
    const out = s.push({ text: ' I will send the invoice tomorrow.', at: 100 });
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe('Yes. I will send the invoice tomorrow.');
    expect(out[0]?.reason).toBe('boundary');
  });
  it('handles Hebrew and Arabic terminators', () => {
    const s = new IncrementalSegmenter();
    expect(s.push({ text: 'האם אתה מגיע מחר לפגישה?', at: 0 })).toHaveLength(1);
    expect(s.push({ text: 'هل ستأتي إلى الاجتماع غدًا؟', at: 10 })).toHaveLength(1);
  });
  it('emits on silence without a boundary', () => {
    const s = new IncrementalSegmenter();
    s.push({ text: 'so what I was thinking is', at: 0 });
    expect(s.tick(500)).toEqual([]);
    const out = s.tick(800);
    expect(out[0]?.reason).toBe('silence');
    expect(s.pending()).toBe('');
  });
  it('emits on hard length limit even mid-clause', () => {
    const s = new IncrementalSegmenter({
      silenceMs: 700,
      softMaxChars: 40,
      hardMaxChars: 60,
      minChars: 5,
    });
    const out = s.push({ text: 'x'.repeat(61), at: 0 });
    expect(out[0]?.reason).toBe('length');
  });
  it('final flag flushes short buffers', () => {
    const s = new IncrementalSegmenter();
    expect(s.push({ text: 'ok', at: 0, final: true })[0]?.reason).toBe('final');
  });
  it('flushes on the silence gap detected via a late delta', () => {
    const s = new IncrementalSegmenter();
    s.push({ text: 'first part', at: 0 });
    const out = s.push({ text: 'second', at: 2000 });
    expect(out).toHaveLength(1);
    expect(out[0]?.text).toBe('first part');
    expect(s.pending()).toBe('second');
  });
});
