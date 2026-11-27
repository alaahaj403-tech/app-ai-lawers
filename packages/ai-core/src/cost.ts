import type { ModelRef } from '@voxeli/config';

/**
 * Cost estimation is advisory. It exists so routing and dashboards can reason
 * about unit economics. It is NOT billing and never shown to end users as a fact.
 */
export interface CostEstimate {
  readonly usd: number | null;
  readonly estimated: boolean;
}

export function estimateTextCost(
  ref: ModelRef,
  inputTokens: number,
  outputTokens: number,
): CostEstimate {
  if (ref.inputUsdPerMillion === undefined || ref.outputUsdPerMillion === undefined) {
    return { usd: null, estimated: false };
  }
  const usd =
    (inputTokens / 1_000_000) * ref.inputUsdPerMillion +
    (outputTokens / 1_000_000) * ref.outputUsdPerMillion;
  return { usd: round6(usd), estimated: true };
}

export function estimateAudioCost(ref: ModelRef, seconds: number): CostEstimate {
  if (ref.audioUsdPerMinute === undefined) return { usd: null, estimated: false };
  return { usd: round6((seconds / 60) * ref.audioUsdPerMinute), estimated: true };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
