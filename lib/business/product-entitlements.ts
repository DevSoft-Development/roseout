import type { BusinessPlanKey } from "./entry-intent";

export const RESTAURANT_PLAN_CATALOG = {
  "essential-plus": { monthlyUsd: 99, smsSegments: 250, marketingEmails: 5000, aiReceptionistMinutes: 75, pos: false, advancedKitchen: false },
  "select-plus": { monthlyUsd: 149, smsSegments: 500, marketingEmails: 10000, aiReceptionistMinutes: 100, pos: true, advancedKitchen: false },
  "signature-plus": { monthlyUsd: 199, smsSegments: 1000, marketingEmails: 20000, aiReceptionistMinutes: 150, pos: true, advancedKitchen: true },
} as const satisfies Record<BusinessPlanKey, {
  monthlyUsd: number; smsSegments: number; marketingEmails: number;
  aiReceptionistMinutes: number; pos: boolean; advancedKitchen: boolean;
}>;

/** For display/eligibility only; actual Stripe prices must resolve server-side. */
export function getRestaurantPlanConfig(plan: BusinessPlanKey) {
  return RESTAURANT_PLAN_CATALOG[plan];
}
