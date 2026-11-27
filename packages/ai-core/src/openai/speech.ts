import type OpenAI from 'openai';
import { failures } from '@voxeli/domain';
import type { CallContext, TextToSpeechProvider } from '../types.js';
import { mapOpenAIError } from './translation.js';

/** Provider hard limit on a single synthesis request. */
export const MAX_TTS_CHARS = 4096;

const MIME: Record<'mp3' | 'wav' | 'pcm' | 'opus', string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  // 24 kHz signed 16-bit little-endian mono, per the provider's `pcm` format.
  pcm: 'audio/L16;rate=24000',
  opus: 'audio/opus',
};

/**
 * Voice selection is deliberately not per-language: the provider's voices are
 * multilingual, and picking a voice by locale would imply an accent guarantee
 * we cannot make. `marin` is the documented quality default.
 */
const DEFAULT_VOICE = 'marin';
const ALLOWED_VOICES = new Set([
  'alloy',
  'ash',
  'ballad',
  'coral',
  'echo',
  'fable',
  'nova',
  'onyx',
  'sage',
  'shimmer',
  'verse',
  'marin',
  'cedar',
]);

export class OpenAITextToSpeechProvider implements TextToSpeechProvider {
  readonly id = 'openai' as const;
  constructor(private readonly client: OpenAI) {}

  async synthesize(
    model: string,
    input: {
      text: string;
      language: string;
      voice?: string;
      format: 'mp3' | 'wav' | 'pcm' | 'opus';
    },
    ctx: CallContext,
  ): Promise<{ audio: Uint8Array; mimeType: string }> {
    if (input.text.length > MAX_TTS_CHARS) {
      throw failures.validation('Text is too long for a single synthesis request');
    }
    const voice = input.voice && ALLOWED_VOICES.has(input.voice) ? input.voice : DEFAULT_VOICE;
    try {
      const response = await this.client.audio.speech.create(
        { model, voice, input: input.text, response_format: input.format },
        { signal: ctx.signal, headers: { 'x-correlation-id': ctx.correlationId } },
      );
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength === 0) throw failures.providerUnavailable('Empty audio from provider');
      return { audio: new Uint8Array(buffer), mimeType: MIME[input.format] };
    } catch (error) {
      throw mapOpenAIError(error);
    }
  }
}
