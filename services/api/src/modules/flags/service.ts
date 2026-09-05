import { FEATURE_FLAGS } from '@voxeli/api-contracts';
import type { FeatureFlagKey } from '@voxeli/api-contracts';
import type { Db } from '../../db/client.js';
import { featureFlags } from '../../db/schema.js';

/** Remote kill-switches. Cached briefly; unknown flags default to OFF. */
export class FlagService {
  private cache: { at: number; flags: Record<FeatureFlagKey, boolean> } | null = null;
  constructor(
    private readonly db: Db,
    private readonly ttlMs = 5_000,
  ) {}

  async all(): Promise<Record<FeatureFlagKey, boolean>> {
    if (this.cache && this.ttlMs > 0 && Date.now() - this.cache.at < this.ttlMs)
      return this.cache.flags;
    const rows = await this.db
      .select({ key: featureFlags.key, enabled: featureFlags.enabled })
      .from(featureFlags);
    const flags = Object.fromEntries(FEATURE_FLAGS.map((k) => [k, false])) as Record<
      FeatureFlagKey,
      boolean
    >;
    for (const r of rows)
      if ((FEATURE_FLAGS as readonly string[]).includes(r.key))
        flags[r.key as FeatureFlagKey] = r.enabled;
    this.cache = { at: Date.now(), flags };
    return flags;
  }

  async isEnabled(key: FeatureFlagKey): Promise<boolean> {
    return (await this.all())[key];
  }

  async set(key: FeatureFlagKey, enabled: boolean, updatedBy: string): Promise<void> {
    await this.db
      .insert(featureFlags)
      .values({ key, enabled, updatedBy, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: featureFlags.key,
        set: { enabled, updatedBy, updatedAt: new Date() },
      });
    this.cache = null;
  }

  invalidate(): void {
    this.cache = null;
  }
}
