import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";

export type BusinessOnboardingStepKey = "profile" | "plan" | "reservations" | "events_experiences";
export type BusinessOnboardingStepStatus = "complete" | "needs_setup" | "skipped";

export type BusinessOnboardingStep = {
  key: BusinessOnboardingStepKey;
  title: string;
  description: string;
  href: string;
  action: string;
  status: BusinessOnboardingStepStatus;
  optional: boolean;
};

export type BusinessOnboardingState = {
  locationId: string;
  locationName: string;
  steps: BusinessOnboardingStep[];
  readinessPercent: number;
  completionPercent: number;
  readyForCustomers: boolean;
  nextBestAction: BusinessOnboardingStep | null;
};

function clean(value: unknown) {
  return String(value || "").trim();
}

function hasPhoto(location: Record<string, any>) {
  const images = Array.isArray(location.images) ? location.images : [];
  return Boolean(clean(location.main_image || location.image_url) || images.some((value) => clean(value)));
}

function profileComplete(location: Record<string, any>) {
  const name = getLocationName(location, "");
  const category = clean(location.primary_category || location.category || location.cuisine || location.activity_type);
  const contact = clean(location.phone || location.website);
  return Boolean(
    clean(name) &&
    clean(location.address) &&
    clean(location.city) &&
    clean(location.state) &&
    category &&
    contact &&
    hasPhoto(location)
  );
}

function planComplete(location: Record<string, any>) {
  const status = clean(location.subscription_status).toLowerCase();
  return Boolean(
    clean(location.plan || location.subscription_plan) ||
    location.is_pro === true ||
    ["active", "trialing"].includes(status)
  );
}

function reservationsComplete(location: Record<string, any>) {
  return Boolean(
    clean(location.reservation_mode) ||
    location.reservation_enabled === true ||
    location.internal_reservations_enabled === true ||
    location.uses_internal_reservations === true ||
    clean(location.external_reservation_url || location.reservation_url || location.reservation_link || location.booking_url)
  );
}

async function countForLocation(table: "events" | "experiences", locationId: string) {
  try {
    const query = supabaseAdmin.from(table).select("id", { count: "exact", head: true }).eq("location_id", locationId);
    const { count, error } = table === "events" ? await query.eq("source_kind", "native") : await query;
    if (error) return 0;
    return count || 0;
  } catch {
    return 0;
  }
}

async function readSkippedSteps(locationId: string) {
  try {
    const { data, error } = await supabaseAdmin
      .from("location_onboarding_state")
      .select("skipped_steps")
      .eq("location_id", locationId)
      .maybeSingle();
    if (error) return new Set<BusinessOnboardingStepKey>();
    return new Set<BusinessOnboardingStepKey>((data?.skipped_steps || []) as BusinessOnboardingStepKey[]);
  } catch {
    return new Set<BusinessOnboardingStepKey>();
  }
}

export async function getBusinessOnboardingState(locationId: string): Promise<BusinessOnboardingState | null> {
  const [{ data: location, error }, eventCount, experienceCount, skipped] = await Promise.all([
    supabaseAdmin.from("locations").select("*").eq("id", locationId).maybeSingle(),
    countForLocation("events", locationId),
    countForLocation("experiences", locationId),
    readSkippedSteps(locationId),
  ]);
  if (error || !location) return null;

  const raw = location as Record<string, any>;
  const completed: Record<BusinessOnboardingStepKey, boolean> = {
    profile: profileComplete(raw),
    plan: planComplete(raw),
    reservations: reservationsComplete(raw),
    events_experiences: eventCount + experienceCount > 0,
  };

  const definitions: Array<Omit<BusinessOnboardingStep, "status">> = [
    { key: "profile", title: "Discovery Profile", description: "Help people discover your location with accurate categories, photos, hours, contact details and public information.", href: "/locations/dashboard/profile", action: "Finish profile", optional: false },
    { key: "plan", title: "Optional Software", description: "Explore reservations, marketing, AI and operations when your location needs them. No purchase is required to manage your discovery listing.", href: "/locations/dashboard/billing", action: "Explore plans", optional: true },
    { key: "reservations", title: "Reservations", description: "Set up how guests reserve, or skip this for now and return later.", href: "/locations/dashboard/reservations", action: "Set up reservations", optional: true },
    { key: "events_experiences", title: "Events & Experiences", description: "Create bookable offerings, or skip this for now and return later.", href: "/locations/dashboard/events-experiences", action: "Add offerings", optional: true },
  ];

  const steps = definitions.map((step): BusinessOnboardingStep => ({
    ...step,
    status: completed[step.key] ? "complete" : skipped.has(step.key) && step.optional ? "skipped" : "needs_setup",
  }));

  const resolvedCount = steps.filter((step) => step.status !== "needs_setup").length;
  const completedCount = steps.filter((step) => step.status === "complete").length;
  const requiredReady = steps.filter((step) => !step.optional).every((step) => step.status === "complete");
  // Free discovery readiness must never depend on purchasing software or enabling bookings.
  const readyForCustomers = requiredReady;
  const nextBestAction = steps.find((step) => !step.optional && step.status === "needs_setup") || null;

  return {
    locationId,
    locationName: getLocationName(raw, "Your business"),
    steps,
    readinessPercent: Math.round((resolvedCount / steps.length) * 100),
    completionPercent: Math.round((completedCount / steps.length) * 100),
    readyForCustomers,
    nextBestAction,
  };
}

export async function setBusinessOnboardingStepSkipped(locationId: string, step: BusinessOnboardingStepKey, skipped: boolean) {
  if (!["reservations", "events_experiences"].includes(step)) throw new Error("This onboarding step cannot be skipped.");
  const current = await readSkippedSteps(locationId);
  if (skipped) current.add(step);
  else current.delete(step);
  const { error } = await supabaseAdmin.from("location_onboarding_state").upsert({
    location_id: locationId,
    skipped_steps: [...current],
    updated_at: new Date().toISOString(),
  }, { onConflict: "location_id" });
  if (error) throw error;
}
