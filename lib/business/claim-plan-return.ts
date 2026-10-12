import { buildBusinessEntryQuery, parseBusinessEntryIntent } from "./entry-intent";

/**
 * A no-code claim already uses `plan` for monthly/annual billing frequency.
 * Store software product selection separately, without changing claim API fields.
 * These values never grant ownership or subscriptions.
 */
export function getClaimPlanSelection(query: string) {
  const incoming = new URLSearchParams(query.replace(/^\?/, ""));
  const productPlan = incoming.get("product_plan") || incoming.get("plan");
  const normalized = new URLSearchParams(incoming);
  if (productPlan) normalized.set("plan", productPlan);
  const entry = parseBusinessEntryIntent(normalized);
  return {
    entry,
    productSuffix: entry.plan
      ? `&product_plan=${encodeURIComponent(entry.plan)}${entry.source ? `&source=${encodeURIComponent(entry.source)}` : ""}`
      : "",
    planReviewHref: entry.plan ? `/business/plan-review?${buildBusinessEntryQuery(entry)}` : null,
  };
}
