import type { BusinessPlanKey } from "./entry-intent";

export type CheckoutGateInput = Readonly<{
  plan: BusinessPlanKey | null;
  locationId: string | null;
  ownerVerified: boolean;
  paymentConfirmed: boolean;
}>;

/** Call only with trusted server-side ownership and payment results, never URL flags. */
export function resolveCheckoutGate(input: CheckoutGateInput) {
  if (!input.plan) return { stage: "select_plan" } as const;
  if (!input.locationId) return { stage: "choose_location" } as const;
  if (!input.ownerVerified) return { stage: "verify_owner" } as const;
  if (!input.paymentConfirmed) return { stage: "checkout" } as const;
  return { stage: "activate", plan: input.plan, locationId: input.locationId } as const;
}
