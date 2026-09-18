export const BILLING_STATUSES = [
  "inactive","trialing","active","past_due","grace_period","canceled","comped","incomplete","incomplete_expired","unpaid","paused",
] as const;

export const BUSINESS_PRO_MONTHLY_CENTS = 9900;

type BillingStatus = (typeof BILLING_STATUSES)[number];

export function normalizePlanKey(value?: string | null) {
  const clean = String(value || "").trim().toLowerCase();
  if (["pro","business_pro","business-pro","growth_pro","growth-pro","growth pro","partner_99","partner_pro","pro_reserve","reserve","paid"].includes(clean)) return "business_pro" as const;
  if (["enterprise","enterprise_invoice"].includes(clean)) return "enterprise" as const;
  return "free_discovery" as const;
}

export function normalizeBillingStatus(value?: string | null): BillingStatus {
  const clean = String(value || "").trim().toLowerCase();
  if (["active_partner","paid","current"].includes(clean)) return "active";
  if (clean === "cancelled") return "canceled";
  if ((BILLING_STATUSES as readonly string[]).includes(clean)) return clean as BillingStatus;
  return "inactive";
}

export function isBusinessProPlan(plan?: string | null) {
  return normalizePlanKey(plan) === "business_pro";
}

export function formatBillingMoney(cents?: number | null) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function getBillingPlanLabel(plan?: string | null) {
  return ({ free_discovery: "Free Discovery", business_pro: "Business Pro", enterprise: "Enterprise" } as const)[normalizePlanKey(plan)];
}

export function getBillingStatusLabel(status?: string | null) {
  const normalized = normalizeBillingStatus(status);
  const labels: Record<BillingStatus,string> = {
    inactive:"Inactive", trialing:"Trialing", active:"Active", past_due:"Past due", grace_period:"Grace period", canceled:"Canceled", comped:"Comped", incomplete:"Incomplete", incomplete_expired:"Incomplete expired", unpaid:"Unpaid", paused:"Paused",
  };
  return labels[normalized];
}
