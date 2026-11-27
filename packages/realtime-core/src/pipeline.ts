import type { AudioFrame, AudioInputSource } from './audio-source.js';
import { EchoGuard } from './echo-guard.js';
import { LatencyMeter } from './latency.js';
import { IncrementalSegmenter } from './segmenter.js';
import type { Segment, TranscriptDelta } from './segmenter.js';
import { SessionLedger } from './session-ledger.js';

/**
 * Streaming translation pipeline (Tier 2/3 orchestration and the shared
 * ledger/metrics for Tier 1). Provider transport is injected; this class owns
 * segmentation, echo suppression, barge-in, recovery and measurement.
 *
 *   AudioInputSource → recognizer → segmenter → translator → synthesizer → sink
 */
export interface StreamingRecognizer {
  /** Push audio; deltas are delivered via onDelta. */
  push(frame: AudioFrame): void;
  onDelta(cb: (delta: TranscriptDelta) => void): void;
  close(): Promise<void> | void;
}

export interface SegmentTranslator {
  translate(segment: Segment, sourceLanguage: string, targetLanguage: string): Promise<string>;
}

export interface SpeechSink {
  /** Start playing translated speech; returns when playback has *started*. */
  speak(text: string, language: string): Promise<void>;
  /** Barge-in: stop or duck current playback immediately. */
  interrupt(): void;
}

export interface PipelineEvents {
  onCaption?: (caption: {
    original: string;
    translated: string | null;
    pending: boolean;
    segmentId: string | null;
  }) => void;
  onState?: (state: PipelineState) => void;
  onEchoSuppressed?: (text: string) => void;
}

export type PipelineState =
  'idle' | 'listening' | 'translating' | 'speaking' | 'degraded' | 'stopped';

export interface PipelineConfig {
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly speakTranslations: boolean;
  readonly now?: () => number;
}

export class RealtimeTranslationPipeline {
  readonly ledger = new SessionLedger();
  readonly latency = new LatencyMeter();
  private readonly echo = new EchoGuard();
  private readonly segmenter: IncrementalSegmenter;
  private state: PipelineState = 'idle';
  private stopped = false;
  private speaking = false;

  constructor(
    private readonly source: AudioInputSource,
    private readonly recognizer: StreamingRecognizer,
    private readonly translator: SegmentTranslator,
    private readonly sink: SpeechSink,
    private readonly config: PipelineConfig,
    private readonly events: PipelineEvents = {},
    segmenter?: IncrementalSegmenter,
  ) {
    this.segmenter = segmenter ?? new IncrementalSegmenter();
  }

  private now(): number {
    return this.config.now ? this.config.now() : Date.now();
  }

  private setState(s: PipelineState) {
    if (this.state !== s) {
      this.state = s;
      this.events.onState?.(s);
    }
  }

  currentState(): PipelineState {
    return this.state;
  }

  async run(): Promise<void> {
    const pendingTranslations: Promise<void>[] = [];
    this.recognizer.onDelta((delta) => {
      if (this.stopped) return;
      // Barge-in: user speech while we are speaking → interrupt playback.
      if (
        this.speaking &&
        delta.text.trim().length > 0 &&
        !this.echo.isEcho(delta.text, delta.at)
      ) {
        this.sink.interrupt();
        this.speaking = false;
        this.latency.record('interruption_response', 0);
      }
      const segments = this.segmenter.push(delta);
      this.events.onCaption?.({
        original: this.segmenter.pending(),
        translated: null,
        pending: true,
        segmentId: null,
      });
      for (const seg of segments) pendingTranslations.push(this.handleSegment(seg));
    });

    this.setState('listening');
    this.latency.mark('session_start', this.now());
    for await (const frame of this.source.frames()) {
      if (this.stopped) break;
      this.recognizer.push(frame);
    }
    // Flush trailing text once audio ends.
    for (const seg of this.segmenter.push({ text: '', at: this.now(), final: true })) {
      pendingTranslations.push(this.handleSegment(seg));
    }
    await Promise.all(pendingTranslations);
    await this.recognizer.close();
    this.setState('stopped');
  }

  private async handleSegment(seg: Segment): Promise<void> {
    if (this.echo.isEcho(seg.text, seg.endedAt)) {
      this.events.onEchoSuppressed?.(seg.text);
      return;
    }
    const isNew = this.ledger.confirm({
      id: seg.id,
      speaker: null,
      sourceLanguage: this.config.sourceLanguage,
      original: seg.text,
      startedAt: seg.startedAt,
      endedAt: seg.endedAt,
    });
    if (!isNew) return;
    this.latency.measureFrom('session_start', 'first_transcript', this.now());

    this.setState('translating');
    const t0 = this.now();
    let translated: string;
    try {
      translated = await this.translator.translate(
        seg,
        this.config.sourceLanguage,
        this.config.targetLanguage,
      );
    } catch {
      this.setState('degraded');
      this.events.onCaption?.({
        original: seg.text,
        translated: null,
        pending: false,
        segmentId: seg.id,
      });
      return;
    }
    this.latency.record('translation', this.now() - t0);
    this.ledger.attachTranslation(seg.id, translated);
    this.events.onCaption?.({ original: seg.text, translated, pending: false, segmentId: seg.id });

    if (this.config.speakTranslations && !this.stopped) {
      this.setState('speaking');
      this.speaking = true;
      const s0 = this.now();
      this.echo.emitted(translated, this.now());
      await this.sink.speak(translated, this.config.targetLanguage);
      this.latency.record('synthesis', this.now() - s0);
      this.speaking = false;
    }
    if (!this.stopped) this.setState('listening');
  }

  async stop(): Promise<void> {
    this.stopped = true;
    this.sink.interrupt();
    await this.source.stop();
  }
}
