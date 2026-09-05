import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { AIUsageRecord } from '@voxeli/ai-core';
import { REGRESSION_CASES, extractProtectedEntities } from '@voxeli/translation-core';
import type { RegressionCase } from '@voxeli/translation-core';
import type { Plan } from '@voxeli/domain';
import { createAIContainer } from '../ai/container.js';
import { loadAIEnv } from '../env.js';

/**
 * AI evaluation harness (spec §65). Runs the controlled regression corpus
 * through the real routing path and reports quality, latency and cost so a
 * model change can be compared against the current configuration.
 *
 * It does NOT score translation "quality" with a number — we do not invent
 * metrics. What it measures objectively:
 *   - entity preservation (numbers, money, dates, phones, URLs, IDs)
 *   - whether a repair pass was needed
 *   - which slot answered and whether routing degraded
 *   - latency and provider-reported token usage / estimated cost
 *
 * Reads only the AI part of the environment (OPENAI_API_KEY / AI_PROVIDER) —
 * it opens no database and signs no tokens. Without a key the mock provider
 * answers and the run measures plumbing, not translation quality.
 *
 * Usage:
 *   pnpm --filter @voxeli/api eval                 # all cases
 *   pnpm --filter @voxeli/api eval -- --quality=fast --json=eval.json
 */

interface CaseResult {
  id: string;
  category: RegressionCase['category'];
  languagePair: string;
  ok: boolean;
  missingEntities: string[];
  integrityViolations: string[];
  repaired: boolean;
  slot: string;
  degraded: boolean;
  latencyMs: number;
  translatedText: string;
  error?: string;
}

interface Args {
  quality: 'fast' | 'default' | 'high';
  plan: Plan;
  json: string | undefined;
  only: string | undefined;
}

function parseArgs(argv: readonly string[]): Args {
  const get = (name: string): string | undefined =>
    argv
      .find((a) => a.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  const quality = get('quality');
  const plan = get('plan');
  return {
    quality: quality === 'fast' || quality === 'high' ? quality : 'default',
    plan: plan === 'free' || plan === 'business' ? plan : 'pro',
    json: get('json'),
    only: get('only'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const env = loadAIEnv();

  const usage: AIUsageRecord[] = [];
  const ai = createAIContainer(env, { record: (r) => void usage.push(r) });

  const cases = args.only
    ? REGRESSION_CASES.filter((c) => c.id === args.only || c.category === args.only)
    : REGRESSION_CASES;
  if (cases.length === 0) {
    console.error(`No regression cases match "${args.only ?? ''}"`);
    process.exit(2);
  }

  console.log(`Voxeli translation evaluation`);
  console.log(
    `  provider mode : ${ai.providerMode}${ai.providerMode === 'mock' ? '  (NOT a real translation — set OPENAI_API_KEY to evaluate quality)' : ''}`,
  );
  console.log(`  quality slot  : ${args.quality}   plan: ${args.plan}`);
  console.log(`  cases         : ${cases.length}\n`);

  const results: CaseResult[] = [];
  for (const testCase of cases) {
    const correlationId = `eval_${randomUUID()}`;
    const started = Date.now();
    try {
      const outcome = await ai.translation.translate(
        {
          text: testCase.source,
          sourceLanguage: testCase.sourceLanguage,
          targetLanguage: testCase.targetLanguage,
          mode: 'natural',
        },
        { plan: args.plan, quality: args.quality, feature: 'eval.translate' },
        { correlationId, timeoutMs: 60_000 },
      );

      // The fixture states which canonical entities must survive; check them
      // against the output independently of the service's own report.
      const outputEntities = new Set(
        extractProtectedEntities(outcome.result.translatedText).map((e) => e.canonical),
      );
      const digits = outcome.result.translatedText.replace(/\D/gu, '');
      const missing = testCase.mustPreserve.filter(
        (m) =>
          !outputEntities.has(m) &&
          !digits.includes(m) &&
          !outcome.result.translatedText.includes(m),
      );

      results.push({
        id: testCase.id,
        category: testCase.category,
        languagePair: `${testCase.sourceLanguage}→${testCase.targetLanguage}`,
        ok: missing.length === 0 && outcome.result.integrity.violations.length === 0,
        missingEntities: missing,
        integrityViolations: [...outcome.result.integrity.violations],
        repaired: outcome.repaired,
        slot: outcome.routing.slot,
        degraded: outcome.routing.degraded,
        latencyMs: Date.now() - started,
        translatedText: outcome.result.translatedText,
      });
    } catch (error) {
      results.push({
        id: testCase.id,
        category: testCase.category,
        languagePair: `${testCase.sourceLanguage}→${testCase.targetLanguage}`,
        ok: false,
        missingEntities: [...testCase.mustPreserve],
        integrityViolations: [],
        repaired: false,
        slot: '-',
        degraded: false,
        latencyMs: Date.now() - started,
        translatedText: '',
        error: error instanceof Error ? error.message : String(error),
      });
    }
    const last = results[results.length - 1];
    if (last) {
      console.log(
        `${last.ok ? 'pass' : 'FAIL'}  ${last.id.padEnd(20)} ${last.languagePair.padEnd(8)} ` +
          `${String(last.latencyMs).padStart(6)}ms  ${last.repaired ? 'repaired ' : ''}` +
          (last.error ?? last.translatedText.slice(0, 60)),
      );
    }
  }

  const failed = results.filter((r) => !r.ok);
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0;
  const inputTokens = usage.reduce((n, u) => n + u.inputUnits, 0);
  const outputTokens = usage.reduce((n, u) => n + u.outputUnits, 0);
  const costed = usage.filter((u) => u.estimatedCostUsd !== null);
  const cost = costed.reduce((n, u) => n + (u.estimatedCostUsd ?? 0), 0);

  console.log(`\nSummary`);
  console.log(`  passed         : ${results.length - failed.length}/${results.length}`);
  console.log(`  repaired       : ${results.filter((r) => r.repaired).length}`);
  console.log(`  degraded route : ${results.filter((r) => r.degraded).length}`);
  console.log(`  latency        : p50 ${p50}ms · p95 ${p95}ms`);
  console.log(
    `  provider calls : ${usage.length} (${inputTokens} in / ${outputTokens} out tokens)`,
  );
  console.log(
    `  estimated cost : ${costed.length === usage.length ? `$${cost.toFixed(6)}` : 'unavailable (no verified price for this model)'}`,
  );
  if (failed.length > 0) {
    console.log(`\nFailures`);
    for (const f of failed) {
      console.log(
        `  ${f.id}: ${f.error ?? `missing ${f.missingEntities.join(', ')} ${f.integrityViolations.join(', ')}`}`,
      );
    }
  }

  if (args.json) {
    writeFileSync(
      args.json,
      JSON.stringify(
        {
          ranAt: new Date().toISOString(),
          providerMode: ai.providerMode,
          quality: args.quality,
          plan: args.plan,
          results,
          summary: {
            total: results.length,
            failed: failed.length,
            p50,
            p95,
            inputTokens,
            outputTokens,
          },
        },
        null,
        2,
      ),
    );
    console.log(`\nWrote ${args.json}`);
  }

  process.exit(failed.length === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(2);
});
