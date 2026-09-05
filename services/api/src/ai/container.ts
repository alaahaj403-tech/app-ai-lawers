import WebSocket from 'ws';
import {
  AIModelRouter,
  MockLiveTranscriptionProvider,
  MockRealtimeProvider,
  OpenAILiveTranscriptionProvider,
  MockTextToSpeechProvider,
  MockTranslationProvider,
  createOpenAIProviders,
} from '@voxeli/ai-core';
import type {
  LiveTranscriptionProvider,
  RouterProviders,
  SocketFactory,
  UsageRecorder,
} from '@voxeli/ai-core';
import { resolveModelConfig } from '@voxeli/config';
import type { ModelConfig, ServerEnv } from '@voxeli/config';
import { TranslationService } from '@voxeli/translation-core';

export interface AIContainer {
  router: AIModelRouter;
  translation: TranslationService;
  /** Server-held live transcription for the Tier-2 relay. */
  transcription: LiveTranscriptionProvider;
  providerMode: 'openai' | 'mock';
  modelConfig: ModelConfig;
}

/**
 * Wires providers from env. Without an OpenAI key (dev/test) the mock provider
 * is used and every model slot is re-pointed to it so routing stays testable.
 * Production refuses to start in mock mode (enforced by env validation).
 */
export function createAIContainer(
  env: ServerEnv,
  usage: UsageRecorder,
  raw: NodeJS.ProcessEnv = process.env,
): AIContainer {
  const useOpenAI =
    env.AI_PROVIDER === 'openai' || (env.AI_PROVIDER === undefined && !!env.OPENAI_API_KEY);
  let modelConfig = resolveModelConfig(raw);
  let providers: RouterProviders;

  if (useOpenAI && env.OPENAI_API_KEY) {
    const p = createOpenAIProviders(env.OPENAI_API_KEY);
    providers = { translation: { openai: p.translation }, realtime: { openai: p.realtime } };
  } else {
    modelConfig = Object.fromEntries(
      Object.entries(modelConfig).map(([k, v]) => [k, { ...v, provider: 'mock' }]),
    ) as ModelConfig;
    providers = {
      translation: { mock: new MockTranslationProvider() },
      realtime: { mock: new MockRealtimeProvider() },
      speech: { mock: new MockTextToSpeechProvider() },
    };
  }

  const transcription: LiveTranscriptionProvider =
    useOpenAI && env.OPENAI_API_KEY
      ? new OpenAILiveTranscriptionProvider(env.OPENAI_API_KEY, wsSocketFactory)
      : new MockLiveTranscriptionProvider();

  const router = new AIModelRouter(modelConfig, providers, usage);
  return {
    router,
    transcription,
    translation: new TranslationService(router),
    providerMode: useOpenAI && env.OPENAI_API_KEY ? 'openai' : 'mock',
    modelConfig,
  };
}

/**
 * `ws`-backed socket factory. Node's global WebSocket cannot set request
 * headers, which provider authentication requires.
 */
const wsSocketFactory: SocketFactory = (url, headers) => {
  const socket = new WebSocket(url, { headers });
  return {
    send: (data) => {
      socket.send(data);
    },
    close: (code, reason) => {
      socket.close(code, reason);
    },
    onOpen: (cb) => {
      socket.on('open', cb);
    },
    onMessage: (cb) => {
      socket.on('message', (data: Buffer) => {
        cb(data.toString('utf8'));
      });
    },
    onError: (cb) => {
      socket.on('error', cb);
    },
    onClose: (cb) => {
      socket.on('close', (code: number, reason: Buffer) => {
        cb(code, reason.toString('utf8'));
      });
    },
  };
};
