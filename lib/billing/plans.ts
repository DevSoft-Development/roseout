export const BILLING_PLAN_KEYS = ["free_discovery", "business_pro", "enterprise"] as const;
export const BILLING_STATUSES = ["inactive", "trialing", "active", "past_due", "grace_period", "canceled", "comped", "incomplete", "unpaid"] as const;
export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];
export type BillingStatus = (typeof BILLING_STATUSES)[number];
export const BUSINESS_PRO_MONTHLY_CENTS = 9900;
export const BUSINESS_PRO_ANNUAL_CENTS = 99900;
const PLAN_LABELS: Record<BillingPlanKey, string> = { free_discovery: "Free Discovery", business_pro: "Business Pro", enterprise: "Enterprise" };
const STATUS_LABELS: Record<BillingStatus, string> = { inactive: "Inactive", trialing: "Trialing", active: "Active", past_due: "Past due", grace_period: "Grace period", canceled: "Canceled", comped: "Comped", incomplete: "Incomplete", unpaid: "Unpaid" };
export function normalizePlanKey(value?: string | null): BillingPlanKey { const clean = String(value || "").trim().toLowerCase(); if (["pro", "business_pro", "partner_99", "pro_reserve", "reserve", "paid"].includes(clean)) return "business_pro"; if (["enterprise", "enterprise_invoice"].includes(clean)) return "enterprise"; return "free_discovery"; }
export function normalizeBillingStatus(value?: string | null): BillingStatus { const clean = String(value || "").trim().toLowerCase(); if (clean === "active_partner") return "active"; if ((BILLING_STATUSES as readonly string[]).includes(clean)) return clean as BillingStatus; return "inactive"; }
export function isPaidBillingStatus(status?: string | null) { return ["active", "trialing", "comped", "grace_period"].includes(normalizeBillingStatus(status)); }
export function isBusinessProPlan(plan?: string | null) { return normalizePlanKey(plan) === "business_pro"; }
export function formatBillingMoney(cents?: number | null) { return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100); }
export function getBillingPlanLabel(plan?: string | null) { return PLAN_LABELS[normalizePlanKey(plan)]; }
export function getBillingStatusLabel(status?: string | null) { return STATUS_LABELS[normalizeBillingStatus(status)]; }
