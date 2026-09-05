import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_CONFIG } from '@voxeli/config';
import type { ModelConfig } from '@voxeli/config';
import { failures } from '@voxeli/domain';
import { AIModelRouter } from './router.js';
import { MockRealtimeProvider, MockTranslationProvider } from './mock/index.js';
import type { AIUsageRecord, TranslationProvider } from './types.js';
import { ProviderHealth } from './health.js';

const mockConfig: ModelConfig = Object.fromEntries(
  Object.entries(DEFAULT_MODEL_CONFIG).map(([k, v]) => [k, { ...v, provider: 'mock' }]),
) as ModelConfig;

const input = {
  instructions: 'x',
  userContent: '<source_text>\nHello 42\n</source_text>',
  sourceLanguage: 'en',
  targetLanguage: 'he',
  mode: 'natural' as const,
};
const ctx = { correlationId: 'c1' };

function recorder() {
  const records: AIUsageRecord[] = [];
  return { records, record: (r: AIUsageRecord) => void records.push(r) };
}

describe('AIModelRouter.translate', () => {
  it('routes to the default slot and records usage', async () => {
    const usage = recorder();
    const router = new AIModelRouter(
      mockConfig,
      { translation: { mock: new MockTranslationProvider() }, realtime: {} },
      usage,
    );
    const r = await router.translate(
      { input, plan: 'free', quality: 'default', feature: 'translate' },
      ctx,
    );
    expect(r.slot).toBe('translation.default');
    expect(r.degraded).toBe(false);
    expect(usage.records).toHaveLength(1);
    expect(usage.records[0]).toMatchObject({ success: true, feature: 'translate', unit: 'tokens' });
  });

  it('free plan cannot reach the high-quality slot', () => {
    const router = new AIModelRouter(mockConfig, { translation: {}, realtime: {} }, recorder());
    expect(router.translationCandidates('free', 'high')[0]).toBe('translation.default');
    expect(router.translationCandidates('pro', 'high')[0]).toBe('translation.highQuality');
  });

  it('fails over to the next slot when the first provider errors, and marks degraded', async () => {
    let calls = 0;
    const flaky: TranslationProvider = {
      id: 'mock',
      translate: async (model, i, c) => {
        calls += 1;
        if (calls === 1) throw failures.providerUnavailable('down');
        return new MockTranslationProvider().translate(model, i, c);
      },
    };
    const usage = recorder();
    const router = new AIModelRouter(
      mockConfig,
      { translation: { mock: flaky }, realtime: {} },
      usage,
    );
    const r = await router.translate(
      { input, plan: 'pro', quality: 'default', feature: 'translate' },
      ctx,
    );
    expect(r.degraded).toBe(true);
    expect(r.slot).toBe('translation.fast');
    expect(usage.records.map((u) => u.success)).toEqual([false, true]);
    expect(usage.records[1]?.fallbackFrom).toMatch(/translation\.default:PROVIDER_UNAVAILABLE/);
  });

  it('throws a typed failure when every candidate fails (no infinite loop)', async () => {
    const provider = new MockTranslationProvider({
      failWith: () => failures.providerUnavailable('down'),
    });
    const router = new AIModelRouter(
      mockConfig,
      { translation: { mock: provider }, realtime: {} },
      recorder(),
    );
    await expect(
      router.translate({ input, plan: 'pro', quality: 'high', feature: 't' }, ctx),
    ).rejects.toMatchObject({
      code: 'PROVIDER_UNAVAILABLE',
    });
    expect(provider.calls).toBe(3);
  });

  it('opens the circuit after repeated failures and skips the model', async () => {
    let now = 0;
    const health = new ProviderHealth({ failureThreshold: 2, openMs: 1000, now: () => now });
    const provider = new MockTranslationProvider({
      failWith: () => failures.providerUnavailable('down'),
    });
    const router = new AIModelRouter(
      mockConfig,
      { translation: { mock: provider }, realtime: {} },
      recorder(),
      { health },
    );
    await router
      .translate({ input, plan: 'free', quality: 'default', feature: 't' }, ctx)
      .catch(() => undefined);
    // default + fast each failed once; second round: default fails again -> opens; fast fails -> opens
    await router
      .translate({ input, plan: 'free', quality: 'default', feature: 't' }, ctx)
      .catch(() => undefined);
    const callsBefore = provider.calls;
    await router
      .translate({ input, plan: 'free', quality: 'default', feature: 't' }, ctx)
      .catch(() => undefined);
    expect(provider.calls).toBe(callsBefore); // both circuits open: no upstream calls
    now = 2000;
    await router
      .translate({ input, plan: 'free', quality: 'default', feature: 't' }, ctx)
      .catch(() => undefined);
    expect(provider.calls).toBeGreaterThan(callsBefore); // half-open probe allowed
  });

  it('times out slow providers', async () => {
    const slow = new MockTranslationProvider({ latencyMs: 200 });
    const router = new AIModelRouter(
      mockConfig,
      { translation: { mock: slow }, realtime: {} },
      recorder(),
    );
    await expect(
      router.translate(
        { input, plan: 'free', quality: 'fast', feature: 't' },
        { ...ctx, timeoutMs: 20 },
      ),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

describe('AIModelRouter.selectRealtimeTier', () => {
  it('prefers tier1 for pro plans and degrades to tier2 for free plans with a reason', () => {
    const router = new AIModelRouter(
      mockConfig,
      { translation: {}, realtime: { mock: new MockRealtimeProvider() } },
      recorder(),
    );
    expect(
      router.selectRealtimeTier({ plan: 'pro', targetLanguage: 'he', tier1Allowed: true }).tier,
    ).toBe('tier1_s2s');
    const free = router.selectRealtimeTier({
      plan: 'free',
      targetLanguage: 'he',
      tier1Allowed: false,
    });
    expect(free.tier).toBe('tier2_streaming');
    expect(free.degradedReason).toBe('plan_does_not_include_tier1');
  });
  it('falls back when the provider lacks tier1 for the language', () => {
    const router = new AIModelRouter(
      mockConfig,
      { translation: {}, realtime: { mock: new MockRealtimeProvider(['tier2_streaming']) } },
      recorder(),
    );
    const r = router.selectRealtimeTier({ plan: 'pro', targetLanguage: 'yi', tier1Allowed: true });
    expect(r.tier).toBe('tier2_streaming');
    expect(r.degradedReason).toBe('tier1_unsupported_for_language');
  });
});
