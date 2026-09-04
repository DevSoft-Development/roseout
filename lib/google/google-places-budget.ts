import { supabaseAdmin } from "@/lib/supabase-admin";

export const GOOGLE_PLACES_BUDGET_KEY = "google_places_budget";

export const DEFAULT_GOOGLE_PLACES_BUDGET = {
  targetUsd: 175,
  softCapUsd: 190,
  hardCapUsd: 200,
  creditBalanceUsd: 300,
  openingSpendUsd: 0,
  enabled: true,
} as const;

export type GooglePlacesBudgetConfig = {
  targetUsd: number;
  softCapUsd: number;
  hardCapUsd: number;
  creditBalanceUsd: number;
  openingSpendUsd: number;
  enabled: boolean;
};

function money(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.round(parsed * 100) / 100;
}

export function normalizeGooglePlacesBudget(value: unknown): GooglePlacesBudgetConfig {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  let hardCapUsd = money(raw.hardCapUsd, DEFAULT_GOOGLE_PLACES_BUDGET.hardCapUsd);
  let softCapUsd = money(raw.softCapUsd, Math.min(DEFAULT_GOOGLE_PLACES_BUDGET.softCapUsd, hardCapUsd));
  let targetUsd = money(raw.targetUsd, Math.min(DEFAULT_GOOGLE_PLACES_BUDGET.targetUsd, softCapUsd));
  softCapUsd = Math.min(softCapUsd, hardCapUsd);
  targetUsd = Math.min(targetUsd, softCapUsd);
  return {
    targetUsd,
    softCapUsd,
    hardCapUsd,
    creditBalanceUsd: money(raw.creditBalanceUsd, DEFAULT_GOOGLE_PLACES_BUDGET.creditBalanceUsd),
    openingSpendUsd: money(raw.openingSpendUsd, DEFAULT_GOOGLE_PLACES_BUDGET.openingSpendUsd),
    enabled: raw.enabled !== false,
  };
}

export async function getGooglePlacesBudgetConfig() {
  try {
    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", GOOGLE_PLACES_BUDGET_KEY)
      .maybeSingle();
    if (error) throw error;
    return normalizeGooglePlacesBudget(data?.value);
  } catch {
    return normalizeGooglePlacesBudget(null);
  }
}
