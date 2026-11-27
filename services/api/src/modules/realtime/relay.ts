import { and, eq } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import type { AIModelRouter } from '@voxeli/ai-core';
import type { LiveTranscriptionProvider } from '@voxeli/ai-core';
import { RELAY_SAMPLE_RATE, relayClientMessageSchema } from '@voxeli/api-contracts';
import type { RelayServerMessage } from '@voxeli/api-contracts';
import { AppFailure, failures } from '@voxeli/domain';
import type { Plan } from '@voxeli/domain';
import {
  PushAudioSource,
  RealtimeTranslationPipeline,
  pcm16FrameFromBytes,
} from '@voxeli/realtime-core';
import type { SegmentTranslator, SpeechSink, StreamingRecognizer } from '@voxeli/realtime-core';
import type { TranslationService } from '@voxeli/translation-core';
import type { Db } from '../../db/client.js';
import { realtimeSessions } from '../../db/schema.js';
import type { QuotaService } from '../usage/quota.js';

/** The socket surface the relay needs; satisfied by `ws` and by test fakes. */
export interface RelaySocket {
  send(data: string | Uint8Array): void;
  close(code?: number, reason?: string): void;
  onText(cb: (text: string) => void): void;
  onBinary(cb: (data: Uint8Array) => void): void;
  onClose(cb: () => void): void;
}

export interface RelayDeps {
  db: Db;
  router: AIModelRouter;
  translation: TranslationService;
  transcription: LiveTranscriptionProvider;
  quota: QuotaService;
  log: FastifyBaseLogger;
  /** Injected in tests to drive the metering clock. */
  now?: () => number;
  setInterval?: typeof setInterval;
  clearInterval?: typeof clearInterval;
  /** How long a session survives without a socket before it is closed (default 30 s). */
  detachGraceMs?: number;
  /** Called when the session has fully finished, so a registry can forget it. */
  onFinished?: (sessionId: string) => void;
}

export interface RelaySessionContext {
  sessionId: string;
  userId: string;
  plan: Plan;
  correlationId: string;
  myLanguage: string;
  targetLanguage: string;
  speakTranslations: boolean;
  transcriptionModel: string;
}

/** Close codes above 4000 are ours; the client maps them to user-facing copy. */
export const RELAY_CLOSE = {
  normal: 1000,
  quotaExhausted: 4003,
  providerUnavailable: 4004,
  internal: 4005,
} as const;

const METER_INTERVAL_MS = 60_000;
const DEFAULT_DETACH_GRACE_MS = 30_000;

/**
 * Tier-2 realtime relay.
 *
 * The device streams PCM to us; we hold the provider transcription socket,
 * translate confirmed segments, synthesize the translation and stream captions
 * and audio back. Because the media path runs through the server, realtime
 * minutes are metered here — one minute charged on connect and one for each
 * further minute in progress — rather than trusting a client's report.
 */
export class RelaySession {
  private readonly source = new PushAudioSource(RELAY_SAMPLE_RATE);
  private readonly startedAt: number;
  private minutesCharged = 0;
  private meterTimer: ReturnType<typeof setInterval> | null = null;
  private pipeline: RealtimeTranslationPipeline | null = null;
  private closed = false;
  private closeReason = 'client_closed';
  /** True between a socket loss and a reattach; nothing is sent, the ledger keeps filling. */
  private detached = false;
  private graceTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnects = 0;
  /** Segment ids already announced on the current socket; a replay never repeats them. */
  private sentSegments = new Set<string>();

  constructor(
    private socket: RelaySocket,
    private readonly ctx: RelaySessionContext,
    private readonly deps: RelayDeps,
  ) {
    this.startedAt = this.now();
    // Wire the socket before any await so audio that arrives during provider
    // setup is buffered by the source rather than dropped.
    this.wireSocket();
  }

  private now(): number {
    return this.deps.now ? this.deps.now() : Date.now();
  }

  private send(message: RelayServerMessage): void {
    if (this.closed || this.detached) return;
    this.socket.send(JSON.stringify(message));
  }

  private sendSegment(entry: { id: string; original: string; sourceLanguage: string }): void {
    if (this.sentSegments.has(entry.id)) return;
    this.sentSegments.add(entry.id);
    this.send({
      type: 'segment',
      segmentId: entry.id,
      original: entry.original,
      sourceLanguage: entry.sourceLanguage,
    });
  }

  get isLive(): boolean {
    return !this.closed;
  }

  /**
   * A client that lost its connection comes back with a fresh ticket. The
   * provider stream, ledger and metering carried on; only the socket changes.
   * The client then sends `resume` to receive what it missed.
   */
  attach(socket: RelaySocket): void {
    if (this.closed) throw failures.conflict('Session already ended');
    if (this.graceTimer) {
      clearTimeout(this.graceTimer);
      this.graceTimer = null;
    }
    // Drop the old socket quietly if it is somehow still open.
    try {
      this.socket.close(RELAY_CLOSE.normal, 'replaced');
    } catch {
      /* already gone */
    }
    this.socket = socket;
    this.detached = false;
    this.reconnects += 1;
    this.sentSegments = new Set();
    this.wireSocket();
    this.send({
      type: 'ready',
      sessionId: this.ctx.sessionId,
      tier: 'tier2_streaming',
      sampleRate: RELAY_SAMPLE_RATE,
      speakTranslations: this.ctx.speakTranslations,
    });
  }

  async run(): Promise<void> {
    // Charge the first minute before any provider cost is incurred.
    try {
      await this.chargeMinute();
    } catch (error) {
      this.fail(error, RELAY_CLOSE.quotaExhausted, 'quota_exhausted');
      return;
    }

    let transcriptionSession;
    try {
      transcriptionSession = await this.deps.transcription.open(
        this.ctx.transcriptionModel,
        {
          sampleRate: RELAY_SAMPLE_RATE,
          languageHints: this.ctx.myLanguage === 'auto' ? [] : [this.ctx.myLanguage],
        },
        { correlationId: this.ctx.correlationId, timeoutMs: 10_000 },
      );
    } catch (error) {
      this.fail(error, RELAY_CLOSE.providerUnavailable, 'provider_unavailable');
      return;
    }

    const recognizer: StreamingRecognizer = {
      push: (frame) => {
        const bytes = new Uint8Array(
          frame.pcm16.buffer,
          frame.pcm16.byteOffset,
          frame.pcm16.byteLength,
        );
        transcriptionSession.push(bytes);
      },
      onDelta: (cb) => {
        transcriptionSession.onDelta((d) => {
          cb(
            d.final === undefined
              ? { text: d.text, at: d.at }
              : { text: d.text, at: d.at, final: d.final },
          );
        });
      },
      close: () => {
        transcriptionSession.close();
      },
    };
    transcriptionSession.onError((error) => {
      this.deps.log.warn(
        { err: error, sessionId: this.ctx.sessionId },
        'transcription stream error',
      );
      this.send({
        type: 'error',
        code: 'PROVIDER_UNAVAILABLE',
        message: 'Transcription interrupted',
        retryable: true,
      });
    });

    const translator: SegmentTranslator = {
      translate: async (segment, sourceLanguage, targetLanguage) => {
        const outcome = await this.deps.translation.translate(
          { text: segment.text, sourceLanguage, targetLanguage, mode: 'natural' },
          { plan: this.ctx.plan, quality: 'fast', feature: 'realtime.segment' },
          { correlationId: this.ctx.correlationId, timeoutMs: 15_000 },
        );
        return outcome.result.translatedText;
      },
    };

    const sink: SpeechSink = {
      speak: async (text, language) => {
        if (!this.ctx.speakTranslations || this.closed) return;
        const speech = await this.deps.router.synthesize(
          { text, language, format: 'mp3', feature: 'realtime.speech' },
          { correlationId: this.ctx.correlationId, timeoutMs: 20_000 },
        );
        const segmentId = this.pipeline?.ledger.lastConfirmedId() ?? 'unknown';
        this.send({
          type: 'audio_begin',
          segmentId,
          mimeType: speech.mimeType,
          byteLength: speech.audio.byteLength,
        });
        if (!this.closed) this.socket.send(speech.audio);
      },
      interrupt: () => {
        // Playback lives on the device; the client stops it when it sees this.
        this.send({ type: 'partial', text: '' });
      },
    };

    this.pipeline = new RealtimeTranslationPipeline(
      this.source,
      recognizer,
      translator,
      sink,
      {
        sourceLanguage: this.ctx.myLanguage === 'auto' ? 'auto' : this.ctx.myLanguage,
        targetLanguage: this.ctx.targetLanguage,
        speakTranslations: this.ctx.speakTranslations,
        ...(this.deps.now ? { now: this.deps.now } : {}),
      },
      {
        onCaption: (caption) => {
          if (caption.pending) {
            this.send({ type: 'partial', text: caption.original });
            return;
          }
          if (caption.segmentId) {
            this.sendSegment({
              id: caption.segmentId,
              original: caption.original,
              sourceLanguage: this.ctx.myLanguage,
            });
            if (caption.translated !== null) {
              this.send({
                type: 'translation',
                segmentId: caption.segmentId,
                text: caption.translated,
              });
            }
          }
        },
      },
    );

    this.startMetering();

    const quota = await this.deps.quota.peek(this.ctx.userId, this.ctx.plan, 'realtime_minutes');
    this.send({
      type: 'ready',
      sessionId: this.ctx.sessionId,
      tier: 'tier2_streaming',
      sampleRate: RELAY_SAMPLE_RATE,
      speakTranslations: this.ctx.speakTranslations,
    });
    this.send({ type: 'quota', usedMinutes: quota.used, limitMinutes: quota.limit });

    try {
      await this.pipeline.run();
    } catch (error) {
      this.deps.log.error({ err: error, sessionId: this.ctx.sessionId }, 'relay pipeline failed');
      this.closeReason = 'internal_error';
    }
    await this.finish(RELAY_CLOSE.normal);
  }

  private wireSocket(): void {
    this.socket.onBinary((data) => {
      if (this.closed) return;
      this.source.push(pcm16FrameFromBytes(data, RELAY_SAMPLE_RATE, this.now()));
    });

    this.socket.onText((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return; // client frames are untrusted; ignore malformed ones
      }
      const message = relayClientMessageSchema.safeParse(parsed);
      if (!message.success) return;
      switch (message.data.type) {
        case 'stop':
          this.closeReason = 'client_stopped';
          this.source.stop();
          break;
        case 'interrupt':
          // Nothing to stop server-side; playback is on the device.
          break;
        case 'resume': {
          // Replay only what the client is missing — never duplicate segments.
          for (const entry of this.pipeline?.ledger.since(message.data.lastSegmentId) ?? []) {
            this.sendSegment(entry);
            if (entry.translated !== null) {
              this.send({ type: 'translation', segmentId: entry.id, text: entry.translated });
            }
          }
          break;
        }
      }
    });

    const boundSocket = this.socket;
    boundSocket.onClose(() => {
      if (this.closed || this.socket !== boundSocket) return; // replaced by attach()
      if (this.closeReason === 'client_stopped') {
        this.source.stop();
        return;
      }
      // Connection lost mid-session: keep everything alive for a grace period
      // so the client can reattach without losing confirmed segments.
      this.detached = true;
      this.graceTimer = setTimeout(() => {
        if (this.closed) return;
        this.closeReason = 'connection_lost';
        this.source.stop();
      }, this.deps.detachGraceMs ?? DEFAULT_DETACH_GRACE_MS);
      if (typeof this.graceTimer === 'object' && 'unref' in this.graceTimer) {
        (this.graceTimer as { unref: () => void }).unref();
      }
    });
  }

  private startMetering(): void {
    const set = this.deps.setInterval ?? setInterval;
    this.meterTimer = set(() => {
      void this.chargeMinute().catch((error: unknown) => {
        this.fail(error, RELAY_CLOSE.quotaExhausted, 'quota_exhausted');
      });
    }, METER_INTERVAL_MS);
    if (
      typeof this.meterTimer === 'object' &&
      this.meterTimer !== null &&
      'unref' in this.meterTimer
    ) {
      (this.meterTimer as { unref: () => void }).unref();
    }
  }

  private async chargeMinute(): Promise<void> {
    const state = await this.deps.quota.consume(
      this.ctx.userId,
      this.ctx.plan,
      'realtime_minutes',
      1,
    );
    this.minutesCharged += 1;
    this.send({ type: 'quota', usedMinutes: state.used, limitMinutes: state.limit });
  }

  private fail(error: unknown, code: number, reason: string): void {
    const failure = AppFailure.from(error, 'INTERNAL');
    this.closeReason = reason;
    this.send({ type: 'error', ...failure.toPublic() });
    void this.finish(code);
  }

  /** Persist what actually happened, stop metering, and close the socket. */
  private async finish(code: number): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    const clear = this.deps.clearInterval ?? clearInterval;
    if (this.meterTimer) clear(this.meterTimer);
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.source.stop();
    this.pipeline?.stop().catch(() => undefined);

    const durationSeconds = Math.max(0, Math.round((this.now() - this.startedAt) / 1000));
    const metrics = {
      minutesCharged: this.minutesCharged,
      reconnects: this.reconnects,
      droppedFrames: this.source.dropped,
      segments: this.pipeline?.ledger.all().length ?? 0,
      latency: this.pipeline?.latency.snapshot() ?? {},
      closeReason: this.closeReason,
    };
    try {
      await this.deps.db
        .update(realtimeSessions)
        .set({ metrics, durationSeconds, endedAt: new Date(this.now()) })
        .where(
          and(
            eq(realtimeSessions.id, this.ctx.sessionId),
            eq(realtimeSessions.userId, this.ctx.userId),
          ),
        );
    } catch (error) {
      this.deps.log.warn({ err: error }, 'failed to persist relay session metrics');
    }

    this.deps.onFinished?.(this.ctx.sessionId);
    if (this.detached) return; // nobody is listening
    // `closed` is already true, so send directly.
    this.socket.send(
      JSON.stringify({
        type: 'closed',
        reason: this.closeReason,
        durationSeconds,
      } satisfies RelayServerMessage),
    );
    this.socket.close(code, this.closeReason);
  }
}

export function relayFailureFor(error: unknown): AppFailure {
  return AppFailure.is(error) ? error : failures.internal('Relay failed', { cause: error });
}
