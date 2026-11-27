import { describe, expect, it } from 'vitest';
import { SyntheticAudioSource } from './audio-source.js';
import type { AudioFrame } from './audio-source.js';
import { RealtimeTranslationPipeline } from './pipeline.js';
import type { SegmentTranslator, SpeechSink, StreamingRecognizer } from './pipeline.js';
import type { TranscriptDelta } from './segmenter.js';
import { SessionLedger } from './session-ledger.js';

/** Recognizer that emits scripted deltas as frames arrive. */
function scriptedRecognizer(
  script: Record<number, TranscriptDelta[]>,
): StreamingRecognizer & { emit: (d: TranscriptDelta) => void } {
  let cb: ((d: TranscriptDelta) => void) | undefined;
  let frameIndex = 0;
  return {
    push(_frame: AudioFrame) {
      for (const d of script[frameIndex] ?? []) cb?.(d);
      frameIndex += 1;
    },
    onDelta(c) {
      cb = c;
    },
    close() {
      /* nothing to release */
    },
    emit(d) {
      cb?.(d);
    },
  };
}

const frames = Array.from({ length: 6 }, () => new Int16Array(480));

describe('RealtimeTranslationPipeline', () => {
  it('translates segments while audio is still arriving and keeps originals immutable', async () => {
    const translated: string[] = [];
    const spoken: string[] = [];
    const translator: SegmentTranslator = {
      translate: async (seg) => {
        translated.push(seg.text);
        return `HE(${seg.text})`;
      },
    };
    const sink: SpeechSink = {
      speak: async (t) => {
        spoken.push(t);
      },
      interrupt: () => undefined,
    };
    const recognizer = scriptedRecognizer({
      1: [{ text: 'Hello, how are you today?', at: 20 }],
      3: [{ text: 'I need to reschedule our meeting.', at: 60 }],
    });
    let t = 0;
    const p = new RealtimeTranslationPipeline(
      new SyntheticAudioSource(24000, frames),
      recognizer,
      translator,
      sink,
      { sourceLanguage: 'en', targetLanguage: 'he', speakTranslations: true, now: () => (t += 5) },
    );
    await p.run();
    expect(translated).toEqual(['Hello, how are you today?', 'I need to reschedule our meeting.']);
    expect(spoken).toEqual([
      'HE(Hello, how are you today?)',
      'HE(I need to reschedule our meeting.)',
    ]);
    const entries = p.ledger.all();
    expect(entries.map((e) => e.original)).toEqual(translated);
    expect(entries.every((e) => e.translated?.startsWith('HE('))).toBe(true);
    expect(p.latency.stats('translation')?.count).toBe(2);
    expect(p.currentState()).toBe('stopped');
  });

  it('does not re-translate its own spoken output (echo regression)', async () => {
    const suppressed: string[] = [];
    const translatedSegs: string[] = [];
    const recognizer = scriptedRecognizer({
      1: [{ text: 'Where is the train station?', at: 20 }],
    });
    const sink: SpeechSink = {
      speak: async (text) => {
        // Simulate the microphone hearing our own TTS output.
        recognizer.emit({ text, at: 40, final: true });
      },
      interrupt: () => undefined,
    };
    const p = new RealtimeTranslationPipeline(
      new SyntheticAudioSource(24000, frames),
      recognizer,
      {
        translate: async (s) => {
          translatedSegs.push(s.text);
          return `${s.text} [translated]`;
        },
      },
      sink,
      { sourceLanguage: 'en', targetLanguage: 'he', speakTranslations: true },
      { onEchoSuppressed: (t) => void suppressed.push(t) },
    );
    await p.run();
    expect(translatedSegs).toEqual(['Where is the train station?']);
    expect(suppressed).toEqual(['Where is the train station? [translated]']);
  });

  it('interrupts playback on barge-in', async () => {
    let interrupted = 0;
    const recognizer = scriptedRecognizer({ 1: [{ text: 'First sentence is here.', at: 20 }] });
    const sink: SpeechSink = {
      speak: async () => {
        recognizer.emit({ text: 'Wait, actually', at: 30 });
      },
      interrupt: () => {
        interrupted += 1;
      },
    };
    const p = new RealtimeTranslationPipeline(
      new SyntheticAudioSource(24000, frames),
      recognizer,
      { translate: async (s) => `X ${s.text}` },
      sink,
      { sourceLanguage: 'en', targetLanguage: 'he', speakTranslations: true },
    );
    await p.run();
    expect(interrupted).toBeGreaterThanOrEqual(1);
    expect(p.latency.stats('interruption_response')?.count).toBeGreaterThanOrEqual(1);
  });

  it('degrades gracefully when translation fails and still shows the original', async () => {
    const captions: { original: string; translated: string | null; pending: boolean }[] = [];
    const recognizer = scriptedRecognizer({
      1: [{ text: 'This one will fail to translate.', at: 20 }],
    });
    const p = new RealtimeTranslationPipeline(
      new SyntheticAudioSource(24000, frames),
      recognizer,
      { translate: async () => Promise.reject(new Error('down')) },
      { speak: () => Promise.resolve(), interrupt: () => undefined },
      { sourceLanguage: 'en', targetLanguage: 'he', speakTranslations: false },
      { onCaption: (c) => void captions.push(c) },
    );
    await p.run();
    const finalCaption = captions.find((c) => !c.pending);
    expect(finalCaption?.original).toBe('This one will fail to translate.');
    expect(finalCaption?.translated).toBeNull();
  });
});

describe('SessionLedger recovery', () => {
  it('never duplicates segments after a reconnect and replays only what the client lacks', () => {
    const l = new SessionLedger();
    const base = { speaker: null, sourceLanguage: 'en', startedAt: 0, endedAt: 10 };
    expect(l.confirm({ id: 'a', original: 'one', ...base })).toBe(true);
    expect(l.confirm({ id: 'b', original: 'two', ...base })).toBe(true);
    expect(l.confirm({ id: 'a', original: 'one', ...base })).toBe(false);
    l.attachTranslation('a', 'אחד');
    expect(l.since('a').map((e) => e.id)).toEqual(['b']);
    expect(l.all()[0]?.original).toBe('one');
    expect(l.all()[0]?.translated).toBe('אחד');
  });
});
