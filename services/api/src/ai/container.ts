import {
  AIModelRouter,
  MockRealtimeProvider,
  MockTranslationProvider,
  createOpenAIProviders,
} from '@voxeli/ai-core';
import type { RouterProviders, UsageRecorder } from '@voxeli/ai-core';
import { resolveModelConfig } from '@voxeli/config';
import type { ModelConfig, ServerEnv } from '@voxeli/config';
import { TranslationService } from '@voxeli/translation-core';

export interface AIContainer {
  router: AIModelRouter;
  translation: TranslationService;
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
    };
  }

  const router = new AIModelRouter(modelConfig, providers, usage);
  return {
    router,
    translation: new TranslationService(router),
    providerMode: useOpenAI && env.OPENAI_API_KEY ? 'openai' : 'mock',
    modelConfig,
  };
}
