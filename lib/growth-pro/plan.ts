import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const GROWTH_PRO_PRICE_MONTHLY = 99;
export const GROWTH_PRO_SMS_INCLUDED = 100;
export const SMS_ADDONS: Record<string, { price: number; credits: number; label: string }> = {
  sms_500: { price: 29, credits: 500, label: "SMS Add-On — $29/month" },
  sms_1000: { price: 49, credits: 1000, label: "SMS Add-On — $49/month" },
};

export type GrowthProPlanStatus = {
  locationId: string;
  plan: "free" | "growth_pro";
  active: boolean;
  trialActive: boolean;
  adminOverrideActive: boolean;
  subscriptionStatus?: string | null;
  currentPeriodEnd?: string | null;
  trialEndsAt?: string | null;
  smsAddonKey?: string | null;
};

function truthy(value: unknown) {
  return ["true", "1", "yes", "active", "enabled"].includes(String(value ?? "").toLowerCase());
}

function isFuture(value: unknown) {
  if (!value) return false;
  const time = new Date(String(value)).getTime();
  return Number.isFinite(time) && time > Date.now();
}

export async function getLocationPlanStatus(locationId: string): Promise<GrowthProPlanStatus> {
  const { data } = await supabaseAdmin
    .from("locations")
    .select("id,subscription_plan,subscription_status,plan,is_pro,growth_pro_override,growth_pro_trial_ends_at,current_period_end,trial_ends_at,sms_addon_plan")
    .eq("id", locationId)
    .maybeSingle();

  const planText = String(data?.subscription_plan ?? data?.plan ?? "free").toLowerCase();
  const statusText = String(data?.subscription_status ?? "").toLowerCase();
  const planIsGrowthPro = ["growth_pro", "growth-pro", "pro", "growth pro"].includes(planText) || truthy(data?.is_pro);
  const trialActive = isFuture(data?.growth_pro_trial_ends_at ?? data?.trial_ends_at);
  const adminOverrideActive = truthy(data?.growth_pro_override);
  const paidActive = planIsGrowthPro && ["active", "trialing", "paid", "current"].includes(statusText || "active");

  return {
    locationId,
    plan: paidActive || trialActive || adminOverrideActive ? "growth_pro" : "free",
    active: paidActive || trialActive || adminOverrideActive,
    trialActive,
    adminOverrideActive,
    subscriptionStatus: data?.subscription_status ?? null,
    currentPeriodEnd: data?.current_period_end ?? null,
    trialEndsAt: data?.growth_pro_trial_ends_at ?? data?.trial_ends_at ?? null,
    smsAddonKey: data?.sms_addon_plan ?? null,
  };
}

export async function hasGrowthProAccess(locationId: string) {
  return (await getLocationPlanStatus(locationId)).active;
}

export async function requireGrowthProAccess(locationId: string) {
  const status = await getLocationPlanStatus(locationId);
  if (!status.active) throw new Error(getGrowthProUpgradeCopy("default"));
  return status;
}

export async function getGrowthProFeatureLock(featureKey: string, locationId: string) {
  const status = await getLocationPlanStatus(locationId);
  return status.active ? { locked: false, featureKey, copy: null } : { locked: true, featureKey, copy: getGrowthProUpgradeCopy(featureKey) };
}

export async function getSmsCreditAllowance(locationId: string) {
  const status = await getLocationPlanStatus(locationId);
  if (!status.active) return 0;
  return GROWTH_PRO_SMS_INCLUDED + (status.smsAddonKey ? SMS_ADDONS[status.smsAddonKey]?.credits ?? 0 : 0);
}

export function getGrowthProUpgradeCopy(featureKey: string) {
  const names: Record<string, string> = {
    branding: "premium branding",
    menu: "Menu, Packages & Pricing Hub",
    qr: "QR Growth Hub",
    messaging: "approved email/SMS campaigns",
    analytics: "Growth Pro analytics",
    default: "Growth Pro",
  };
  return `Unlock ${names[featureKey] || names.default} with Growth Pro — $99/month. Get discovered, capture customers, promote smarter, respond faster, and track results.`;
}
