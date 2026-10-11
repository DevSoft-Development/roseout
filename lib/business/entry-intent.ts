/**
 * Stable onboarding intents shared by claim and paid-plan entrypoints.
 * Query parameters describe intent only; never authorize access or pricing.
 */
export const BUSINESS_PLAN_KEYS = ["essential-plus", "select-plus", "signature-plus"] as const;
export type BusinessPlanKey = (typeof BUSINESS_PLAN_KEYS)[number];
export type OnboardingIntent = "claim" | "signup" | "upgrade";
export type BusinessEntryIntent = Readonly<{
  intent: OnboardingIntent;
  plan: BusinessPlanKey | null;
  locationId: string | null;
  source: "theouthaven" | "thereservehaven" | "theposhaven" | null;
}>;

export function parseBusinessEntryIntent(params: URLSearchParams): BusinessEntryIntent {
  const rawIntent = params.get("intent");
  const intent: OnboardingIntent =
    rawIntent === "claim" || rawIntent === "upgrade" ? rawIntent : "signup";
  const rawPlan = params.get("plan");
  const plan = BUSINESS_PLAN_KEYS.find((key) => key === rawPlan) ?? null;
  const rawId = params.get("location_id")?.trim() ?? "";
  const locationId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rawId)
    ? rawId : null;
  const rawSource = params.get("source");
  const source = rawSource === "theouthaven" || rawSource === "thereservehaven" || rawSource === "theposhaven"
    ? rawSource : null;
  return { intent, plan, locationId, source };
}

export function buildBusinessEntryQuery(entry: BusinessEntryIntent): string {
  const q = new URLSearchParams({ intent: entry.intent });
  if (entry.plan) q.set("plan", entry.plan);
  if (entry.locationId) q.set("location_id", entry.locationId);
  if (entry.source) q.set("source", entry.source);
  return q.toString();
}
