import { canActivateLocationPlan, matchesCurrentLocationSubscription, verifiedLocationPlanFromStripe } from "./stripe-location-entitlements";

/** Fail closed when an event belongs to a different or superseded subscription. */
export function evaluateLocationSubscriptionEvent(input: {
  currentSubscriptionId: string | null;
  eventSubscriptionId: string | null;
  authoritativeSubscriptionId: string | null;
  locationId: string | null;
  source?: unknown;
  plan?: unknown;
  priceId?: unknown;
  livemode: boolean;
  currentStatus?: string | null;
  environment?: NodeJS.ProcessEnv;
}) {
  if (!input.locationId) return { action: "ignore", reason: "missing_location" } as const;
  if (!matchesCurrentLocationSubscription(input.eventSubscriptionId, input.authoritativeSubscriptionId))
    return { action: "ignore", reason: "stale_subscription" } as const;
  if (input.currentSubscriptionId && input.currentSubscriptionId !== input.authoritativeSubscriptionId)
    return { action: "ignore", reason: "superseded_subscription" } as const;
  const plan = verifiedLocationPlanFromStripe(input);
  if (!plan) return { action: "ignore", reason: "invalid_price_or_plan" } as const;
  if (!canActivateLocationPlan({ plan, locationId: input.locationId, subscriptionId: input.authoritativeSubscriptionId, status: input.currentStatus }))
    return { action: "deactivate", plan } as const;
  return { action: "activate", plan } as const;
}
