import type { ProviderHealthSnapshot, ProviderId } from './types.js';

/**
 * Minimal circuit breaker per (provider, model). Prevents hammering a failing
 * upstream and makes failover decisions explainable.
 */
export class ProviderHealth {
  private readonly state = new Map<string, { failures: number; openUntil: number | null }>();

  constructor(
    private readonly options: { failureThreshold: number; openMs: number; now?: () => number } = {
      failureThreshold: 3,
      openMs: 30_000,
    },
  ) {}

  private key(provider: ProviderId, model: string): string {
    return `${provider}:${model}`;
  }
  private now(): number {
    return this.options.now ? this.options.now() : Date.now();
  }

  isAvailable(provider: ProviderId, model: string): boolean {
    const s = this.state.get(this.key(provider, model));
    if (!s?.openUntil) return true;
    if (this.now() >= s.openUntil) {
      // half-open: allow a probe
      s.openUntil = null;
      return true;
    }
    return false;
  }

  recordSuccess(provider: ProviderId, model: string): void {
    this.state.set(this.key(provider, model), { failures: 0, openUntil: null });
  }

  recordFailure(provider: ProviderId, model: string): void {
    const k = this.key(provider, model);
    const s = this.state.get(k) ?? { failures: 0, openUntil: null };
    s.failures += 1;
    if (s.failures >= this.options.failureThreshold) s.openUntil = this.now() + this.options.openMs;
    this.state.set(k, s);
  }

  snapshot(): ProviderHealthSnapshot[] {
    return [...this.state.entries()].map(([k, s]) => {
      const [provider, ...rest] = k.split(':');
      return {
        provider: provider as ProviderId,
        model: rest.join(':'),
        consecutiveFailures: s.failures,
        openUntil: s.openUntil,
      };
    });
  }
}
