"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { allocatePublicSlug } from "@/lib/public-slugs";
import { easternDateTimeToIso } from "@/lib/eastern-time";
import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";

async function userId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sign in required.");
  return data.user.id;
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function selectedDateTime(formData: FormData, dateKey: string, timeKey: string, legacyKey: string) {
  const date = text(formData, dateKey);
  const time = text(formData, timeKey);
  if (date || time) {
    if (!date || !time) throw new Error("Choose both a date and time.");
    return easternDateTimeToIso(date, time);
  }
  const legacy = text(formData, legacyKey);
  if (!legacy) return null;
  const parsed = new Date(legacy);
  if (Number.isNaN(parsed.getTime())) throw new Error("Choose a valid date and time.");
  return parsed.toISOString();
}

async function assertOwner(uid: string, organizationId: string | null, locationId: string | null) {
  if (organizationId) {
    const { data } = await supabaseAdmin.from("organization_members").select("id").eq("organization_id", organizationId).eq("user_id", uid).eq("status", "active").maybeSingle();
    if (data) return;
  }
  if (locationId) {
    const access = await getLocationOwnerAccess(uid);
    if (access.isAdmin) {
      if (!access.adminCanEdit) throw new Error("Your admin role is view-only for location changes.");
      return;
    }
    const [{ data: owner }, { data: team }] = await Promise.all([
      supabaseAdmin.from("location_owner_locations").select("id").eq("location_id", locationId).eq("user_id", uid).eq("status", "active").maybeSingle(),
      supabaseAdmin.from("location_team_members").select("id").eq("location_id", locationId).eq("user_id", uid).eq("invitation_status", "accepted").maybeSingle(),
    ]);
    if (owner || team) return;
  }
  throw new Error("You do not have access to this creator account.");
}

function revalidateExperienceWorkspaces() {
  revalidatePath("/experiences");
  revalidatePath("/organizers/dashboard/experiences");
  revalidatePath("/locations/dashboard/experiences");
  revalidatePath("/locations/dashboard/events-experiences");
}

export async function createExperienceAction(formData: FormData) {
  const uid = await userId();
  const organizationId = text(formData, "organization_id") || null;
  const locationId = text(formData, "location_id") || null;
  if (!!organizationId === !!locationId) throw new Error("Choose exactly one experience owner.");
  await assertOwner(uid, organizationId, locationId);

  const title = text(formData, "title");
  if (!title) throw new Error("Title is required.");
  const requestedSlug = text(formData, "slug") || null;
  const slug = await allocatePublicSlug("experiences", title, requestedSlug);
  const durationMinutes = Math.max(15, Number(formData.get("duration_minutes") || 60));
  const minPartySize = Math.max(1, Number(formData.get("min_party_size") || 1));
  const maxPartySize = Math.max(minPartySize, Number(formData.get("max_party_size") || 10));

  const { data: experience, error } = await supabaseAdmin.from("experiences").insert({
    organization_id: organizationId,
    location_id: locationId,
    created_by: uid,
    title,
    slug,
    description: text(formData, "description") || null,
    category: text(formData, "category") || null,
    image_url: text(formData, "image_url") || null,
    venue_name: text(formData, "venue_name") || null,
    address: text(formData, "address") || null,
    city: text(formData, "city") || null,
    state: text(formData, "state") || null,
    zip_code: text(formData, "zip_code") || null,
    duration_minutes: durationMinutes,
    min_party_size: minPartySize,
    max_party_size: maxPartySize,
    price_per_person: Math.max(0, Number(formData.get("price_per_person") || 0)),
    status: "draft",
    searchable: false,
  }).select("id").single();
  if (error || !experience) throw error || new Error("Unable to create experience.");

  const initialStartsAt = selectedDateTime(formData, "initial_date", "initial_time", "initial_starts_at");
  if (initialStartsAt) {
    const startsAt = new Date(initialStartsAt);
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60000);
    const initialCapacity = Math.max(1, Number(formData.get("initial_capacity") || maxPartySize));
    const { error: slotError } = await supabaseAdmin.from("experience_slots").insert({
      experience_id: experience.id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      capacity: initialCapacity,
      status: "open",
    });
    if (slotError) {
      await supabaseAdmin.from("experiences").delete().eq("id", experience.id);
      throw slotError;
    }
  }

  revalidateExperienceWorkspaces();
}

export async function addExperienceSlotAction(formData: FormData) {
  const uid = await userId();
  const experienceId = text(formData, "experience_id");
  const { data: experience } = await supabaseAdmin.from("experiences").select("organization_id,location_id,duration_minutes").eq("id", experienceId).maybeSingle();
  if (!experience) throw new Error("Experience not found.");
  await assertOwner(uid, experience.organization_id, experience.location_id);
  const startsIso = selectedDateTime(formData, "slot_date", "slot_time", "starts_at");
  if (!startsIso) throw new Error("Choose the start date and time.");
  const startsAt = new Date(startsIso);
  const duration = Number(formData.get("duration_minutes") || experience.duration_minutes || 60);
  const endsAt = new Date(startsAt.getTime() + duration * 60000);
  const capacity = Math.max(1, Number(formData.get("capacity") || 1));
  const { error } = await supabaseAdmin.from("experience_slots").insert({ experience_id: experienceId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), capacity });
  if (error) throw error;
  revalidateExperienceWorkspaces();
}

export async function setExperienceStatusAction(formData: FormData) {
  const uid = await userId();
  const experienceId = text(formData, "experience_id");
  const status = text(formData, "status") || "draft";
  if (!["draft","published","paused","archived"].includes(status)) throw new Error("Invalid status.");
  const { data: experience } = await supabaseAdmin.from("experiences").select("organization_id,location_id").eq("id", experienceId).maybeSingle();
  if (!experience) throw new Error("Experience not found.");
  await assertOwner(uid, experience.organization_id, experience.location_id);

  if (status === "published") {
    const decisions = [getFraudDecision("experience", experienceId)];
    if (experience.location_id) decisions.push(getFraudDecision("location", String(experience.location_id)));
    if (experience.organization_id) decisions.push(getFraudDecision("organizer", String(experience.organization_id)));
    const blockingDecision = (await Promise.all(decisions)).find(fraudDecisionPreventsSensitiveAction);
    if (blockingDecision) {
      throw new Error("This experience is temporarily held for Trust & Safety review. Resolve the fraud case before publishing.");
    }
  }

  const { error } = await supabaseAdmin.from("experiences").update({ status, searchable: status === "published", updated_at: new Date().toISOString() }).eq("id", experienceId);
  if (error) throw error;
  revalidateExperienceWorkspaces();
}
