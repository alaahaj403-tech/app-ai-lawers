import type { AIUsageRecord, UsageRecorder } from '@voxeli/ai-core';
import type { FastifyBaseLogger } from 'fastify';
import type { Db } from '../../db/client.js';
import { aiUsage } from '../../db/schema.js';

/**
 * Persists every AI call (cost, latency, success, fallback) for FinOps and
 * provider-health dashboards. Failures here never fail the user request.
 */
export class DbUsageRecorder implements UsageRecorder {
  constructor(
    private readonly db: Db,
    private readonly log: FastifyBaseLogger,
    private readonly userIdFor: (correlationId: string) => string | null,
  ) {}

  async record(r: AIUsageRecord): Promise<void> {
    try {
      await this.db.insert(aiUsage).values({
        userId: this.userIdFor(r.correlationId),
        correlationId: r.correlationId,
        feature: r.feature,
        slot: r.slot,
        provider: r.provider,
        model: r.model,
        unit: r.unit,
        inputUnits: r.inputUnits,
        outputUnits: r.outputUnits,
        latencyMs: r.latencyMs,
        success: r.success,
        retries: r.retries,
        fallbackFrom: r.fallbackFrom ?? null,
        errorCode: r.errorCode ?? null,
        estimatedCostUsd: r.estimatedCostUsd === null ? null : r.estimatedCostUsd.toFixed(6),
      });
    } catch (err) {
      this.log.warn({ err }, 'failed to persist ai usage');
    }
  }
}
