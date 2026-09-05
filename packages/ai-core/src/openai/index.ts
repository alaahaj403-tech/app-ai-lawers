import OpenAI from 'openai';
import { OpenAITranslationProvider } from './translation.js';
import { OpenAIRealtimeProvider } from './realtime.js';

export function createOpenAIProviders(apiKey: string) {
  const client = new OpenAI({ apiKey, maxRetries: 1 });
  return {
    translation: new OpenAITranslationProvider(client),
    realtime: new OpenAIRealtimeProvider(apiKey),
  };
}
export { OpenAITranslationProvider, OpenAIRealtimeProvider };
