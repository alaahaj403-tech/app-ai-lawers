import { sql } from 'drizzle-orm';
import { DEFAULT_ENTITLEMENTS, failures } from '@voxeli/domain';
import type { Plan, QuotaDimension } from '@voxeli/domain';
import type { Db } from '../../db/client.js';
import { usageQuotas } from '../../db/schema.js';

export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

export interface QuotaState {
  dimension: QuotaDimension;
  used: number;
  limit: number | null;
}

/**
 * Atomic quota accounting. `consume` increments only when the result stays
 * within the plan limit, in a single statement — safe under concurrency.
 */
export class QuotaService {
  constructor(private readonly db: Db) {}

  limitFor(plan: Plan, dimension: QuotaDimension): number | null {
    return DEFAULT_ENTITLEMENTS[plan].quotas[dimension];
  }

  async consume(
    userId: string,
    plan: Plan,
    dimension: QuotaDimension,
    amount: number,
  ): Promise<QuotaState> {
    const limit = this.limitFor(plan, dimension);
    const period = currentPeriod();
    if (limit === null) {
      const rows = await this.db
        .insert(usageQuotas)
        .values({ userId, dimension, period, used: amount })
        .onConflictDoUpdate({
          target: [usageQuotas.userId, usageQuotas.dimension, usageQuotas.period],
          set: { used: sql`${usageQuotas.used} + ${amount}`, updatedAt: new Date() },
        })
        .returning({ used: usageQuotas.used });
      return { dimension, used: rows[0]?.used ?? amount, limit };
    }
    if (amount > limit) throw failures.quota('Request exceeds plan limit', { dimension, limit });
    const rows = await this.db
      .insert(usageQuotas)
      .values({ userId, dimension, period, used: amount })
      .onConflictDoUpdate({
        target: [usageQuotas.userId, usageQuotas.dimension, usageQuotas.period],
        set: { used: sql`${usageQuotas.used} + ${amount}`, updatedAt: new Date() },
        setWhere: sql`${usageQuotas.used} + ${amount} <= ${limit}`,
      })
      .returning({ used: usageQuotas.used });
    const row = rows[0];
    if (!row) {
      const state = await this.peek(userId, plan, dimension);
      throw failures.quota('Plan limit reached', { dimension, used: state.used, limit });
    }
    return { dimension, used: row.used, limit };
  }

  async peek(userId: string, plan: Plan, dimension: QuotaDimension): Promise<QuotaState> {
    const period = currentPeriod();
    const rows = await this.db
      .select({ used: usageQuotas.used })
      .from(usageQuotas)
      .where(
        sql`${usageQuotas.userId} = ${userId} and ${usageQuotas.dimension} = ${dimension} and ${usageQuotas.period} = ${period}`,
      )
      .limit(1);
    return { dimension, used: rows[0]?.used ?? 0, limit: this.limitFor(plan, dimension) };
  }

  /** Give back capacity when a downstream step failed after reservation. */
  async refund(userId: string, dimension: QuotaDimension, amount: number): Promise<void> {
    const period = currentPeriod();
    await this.db
      .update(usageQuotas)
      .set({ used: sql`greatest(${usageQuotas.used} - ${amount}, 0)`, updatedAt: new Date() })
      .where(
        sql`${usageQuotas.userId} = ${userId} and ${usageQuotas.dimension} = ${dimension} and ${usageQuotas.period} = ${period}`,
      );
  }
}
