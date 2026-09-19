"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { setBusinessOnboardingStepSkipped, type BusinessOnboardingStepKey } from "@/lib/business-onboarding";

export async function updateOnboardingSkip(formData: FormData) {
  const locationId = String(formData.get("location_id") || "").trim();
  const step = String(formData.get("step") || "").trim() as BusinessOnboardingStepKey;
  const skipped = String(formData.get("skipped") || "") === "1";
  if (!locationId || !["reservations", "events_experiences"].includes(step)) return;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const access = await requireOwnerOrAdminAccessToLocation(user.id, locationId);
  if (!access) return;

  await setBusinessOnboardingStepSkipped(locationId, step, skipped);
  revalidatePath("/locations/dashboard/business-setup");
}
