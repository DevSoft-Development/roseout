import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type ReservationAccessPlan = "free" | "pro";

export type ReservationAccess = {
  plan: ReservationAccessPlan;
  hasAccess: boolean;
  poweredByRequired: true;
  reason?: string;
};

const PLAN_COLUMNS = [
  "plan",
  "subscription_plan",
  "billing_plan",
  "reserve_plan",
  "reservation_plan",
  "reservations_plan",
] as const;

const ENABLED_COLUMNS = [
  "reservation_enabled",
  "internal_reservations_enabled",
  "uses_internal_reservations",
  "reservation_embed_enabled",
] as const;

const PRO_COMPATIBLE_PLANS = new Set(["pro", "premium", "enterprise", "white_label"]);
const FREE_PLANS = new Set(["", "free", "starter", "basic", "null", "none"]);

function normalizePlanValue(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function hasExplicitReservationEnabled(locationOrPlan: unknown) {
  if (!locationOrPlan || typeof locationOrPlan !== "object") return false;
  const record = locationOrPlan as Record<string, unknown>;
  return ENABLED_COLUMNS.some((column) => record[column] === true || String(record[column]).toLowerCase() === "true");
}

function getPlanFromRecord(locationOrPlan: unknown) {
  if (!locationOrPlan || typeof locationOrPlan !== "object") return normalizePlanValue(locationOrPlan);
  const record = locationOrPlan as Record<string, unknown>;
  for (const column of PLAN_COLUMNS) {
    const plan = normalizePlanValue(record[column]);
    if (plan) return plan;
  }
  return "";
}

export function hasReserveAccess(locationOrPlan: unknown) {
  if (hasExplicitReservationEnabled(locationOrPlan)) return true;
  const plan = getPlanFromRecord(locationOrPlan);
  if (PRO_COMPATIBLE_PLANS.has(plan)) return true;
  if (FREE_PLANS.has(plan)) return false;
  return false;
}

export async function getReserveAccessForLocation(locationId: string): Promise<ReservationAccess> {
  if (!locationId) {
    return { plan: "free", hasAccess: false, poweredByRequired: true, reason: "missing_location" };
  }

  const { data: location, error } = await supabaseAdmin
    .from("locations")
    .select("*")
    .eq("id", locationId)
    .maybeSingle();

  if (error || !location) {
    return { plan: "free", hasAccess: false, poweredByRequired: true, reason: error?.message || "location_not_found" };
  }

  let hasAccess = hasReserveAccess(location);

  if (!hasAccess) {
    const { data: subscription } = await supabaseAdmin
      .from("business_subscriptions")
      .select("plan,status,location_id")
      .eq("location_id", locationId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    hasAccess = hasReserveAccess(subscription);
  }

  return {
    plan: hasAccess ? "pro" : "free",
    hasAccess,
    poweredByRequired: true,
    reason: hasAccess ? undefined : "pro_required",
  };
}

export async function requireReserveAccess(locationId: string) {
  const access = await getReserveAccessForLocation(locationId);
  if (!access.hasAccess) {
    throw new Error("Reservations are available on the Pro plan.");
  }
  return access;
}
