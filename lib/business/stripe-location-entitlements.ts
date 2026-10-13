import { isBusinessPlanKey, getLocationSubscriptionPriceId } from "./paid-plan-billing";
import type { BusinessPlanKey } from "./entry-intent";

/** Reject forged metadata and mismatched Stripe price IDs before provisioning. */
export function verifiedLocationPlanFromStripe(input: {
  source?: unknown;
  plan?: unknown;
  priceId?: unknown;
  livemode?: boolean;
  environment?: NodeJS.ProcessEnv;
}): BusinessPlanKey | null {
  if (input.source !== "location_plan_checkout" || !isBusinessPlanKey(input.plan)) return null;
  if (typeof input.priceId !== "string" || !input.priceId) return null;
  const env = input.environment ?? process.env;
  const expected = getLocationSubscriptionPriceId(input.plan, {
    ...env,
    VERCEL_ENV: input.livemode ? "production" : "preview",
  });
  return expected === input.priceId ? input.plan : null;
}

export function canActivateLocationPlan(input: {
  plan: BusinessPlanKey | null;
  status?: string | null;
  subscriptionId?: string | null;
  locationId?: string | null;
}) {
  return Boolean(input.plan && input.locationId && input.subscriptionId && ["active", "trialing"].includes(String(input.status || "").toLowerCase()));
}

/** Invoice and cancellation events may only touch the current subscription. */
export function matchesCurrentLocationSubscription(incoming: unknown, current: unknown): boolean {
  return typeof incoming === "string" && incoming.startsWith("sub_")
    && typeof current === "string" && current === incoming;
}
