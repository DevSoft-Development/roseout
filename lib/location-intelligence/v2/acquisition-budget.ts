/** Pure budget gate; callers must reserve atomically server-side before making a provider request. */
export type BudgetSnapshot = { globalRemainingUsd: number; providerRemainingUsd: number; campaignRemainingUsd: number; runRemainingUsd: number };
export function canAuthorizeProviderCharge(snapshot: BudgetSnapshot, estimatedUsd: number): boolean {
  return Number.isFinite(estimatedUsd) && estimatedUsd >= 0 &&
    Object.values(snapshot).every(remaining => Number.isFinite(remaining) && remaining >= estimatedUsd);
}
export function netPublishedCost(totalUsd: number, netNewSearchable: number): number | null {
  return netNewSearchable > 0 ? totalUsd / netNewSearchable : null;
}
