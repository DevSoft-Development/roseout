"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { allocatePublicSlug } from "@/lib/public-slugs";

async function userId() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sign in required.");
  return data.user.id;
}

async function assertOwner(uid: string, organizationId: string | null, locationId: string | null) {
  if (organizationId) {
    const { data } = await supabaseAdmin.from("organization_members").select("id").eq("organization_id", organizationId).eq("user_id", uid).eq("status", "active").maybeSingle();
    if (data) return;
  }
  if (locationId) {
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
  const organizationId = String(formData.get("organization_id") || "").trim() || null;
  const locationId = String(formData.get("location_id") || "").trim() || null;
  if (!!organizationId === !!locationId) throw new Error("Choose exactly one experience owner.");
  await assertOwner(uid, organizationId, locationId);

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Title is required.");
  const requestedSlug = String(formData.get("slug") || "").trim() || null;
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
    description: String(formData.get("description") || "").trim() || null,
    category: String(formData.get("category") || "").trim() || null,
    image_url: String(formData.get("image_url") || "").trim() || null,
    venue_name: String(formData.get("venue_name") || "").trim() || null,
    address: String(formData.get("address") || "").trim() || null,
    city: String(formData.get("city") || "").trim() || null,
    state: String(formData.get("state") || "").trim() || null,
    zip_code: String(formData.get("zip_code") || "").trim() || null,
    duration_minutes: durationMinutes,
    min_party_size: minPartySize,
    max_party_size: maxPartySize,
    price_per_person: Math.max(0, Number(formData.get("price_per_person") || 0)),
    status: "draft",
    searchable: false,
  }).select("id").single();
  if (error || !experience) throw error || new Error("Unable to create experience.");

  const initialStartsRaw = String(formData.get("initial_starts_at") || "").trim();
  if (initialStartsRaw) {
    const startsAt = new Date(initialStartsRaw);
    if (Number.isNaN(startsAt.getTime())) {
      await supabaseAdmin.from("experiences").delete().eq("id", experience.id);
      throw new Error("Valid first available time required.");
    }
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
  const experienceId = String(formData.get("experience_id") || "");
  const { data: experience } = await supabaseAdmin.from("experiences").select("organization_id,location_id,duration_minutes").eq("id", experienceId).maybeSingle();
  if (!experience) throw new Error("Experience not found.");
  await assertOwner(uid, experience.organization_id, experience.location_id);
  const startsAt = new Date(String(formData.get("starts_at") || ""));
  if (Number.isNaN(startsAt.getTime())) throw new Error("Valid start time required.");
  const duration = Number(formData.get("duration_minutes") || experience.duration_minutes || 60);
  const endsAt = new Date(startsAt.getTime() + duration * 60000);
  const capacity = Math.max(1, Number(formData.get("capacity") || 1));
  const { error } = await supabaseAdmin.from("experience_slots").insert({ experience_id: experienceId, starts_at: startsAt.toISOString(), ends_at: endsAt.toISOString(), capacity });
  if (error) throw error;
  revalidateExperienceWorkspaces();
}

export async function setExperienceStatusAction(formData: FormData) {
  const uid = await userId();
  const experienceId = String(formData.get("experience_id") || "");
  const status = String(formData.get("status") || "draft");
  if (!["draft","published","paused","archived"].includes(status)) throw new Error("Invalid status.");
  const { data: experience } = await supabaseAdmin.from("experiences").select("organization_id,location_id").eq("id", experienceId).maybeSingle();
  if (!experience) throw new Error("Experience not found.");
  await assertOwner(uid, experience.organization_id, experience.location_id);
  const { error } = await supabaseAdmin.from("experiences").update({ status, searchable: status === "published", updated_at: new Date().toISOString() }).eq("id", experienceId);
  if (error) throw error;
  revalidateExperienceWorkspaces();
}
