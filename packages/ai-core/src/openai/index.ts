import OpenAI from 'openai';
import { OpenAITranslationProvider } from './translation.js';
import { OpenAIRealtimeProvider } from './realtime.js';
import { OpenAITextToSpeechProvider } from './speech.js';

export function createOpenAIProviders(apiKey: string) {
  const client = new OpenAI({ apiKey, maxRetries: 1 });
  return {
    translation: new OpenAITranslationProvider(client),
    realtime: new OpenAIRealtimeProvider(apiKey),
    speech: new OpenAITextToSpeechProvider(client),
  };
}
export { OpenAITranslationProvider, OpenAIRealtimeProvider, OpenAITextToSpeechProvider };
export { MAX_TTS_CHARS } from './speech.js';
