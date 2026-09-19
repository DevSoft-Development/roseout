"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationOwnerAccess } from "@/lib/auth/locationOwnerAccess";
import { allocatePublicSlug } from "@/lib/public-slugs";
import { EASTERN_TIME_ZONE, easternDateTimeToIso } from "@/lib/eastern-time";
import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}
function optional(formData: FormData, key: string) { return value(formData, key) || null; }
function selectedDateTime(formData: FormData, prefix: "starts" | "ends") {
  const date = value(formData, `${prefix}_date`);
  const time = value(formData, `${prefix}_time`);
  if (date || time) {
    if (!date || !time) throw new Error(`Choose both the ${prefix === "starts" ? "start" : "end"} date and time.`);
    return easternDateTimeToIso(date, time);
  }
  const legacy = value(formData, `${prefix}_at`);
  if (!legacy) return null;
  const parsed = new Date(legacy);
  if (Number.isNaN(parsed.getTime())) throw new Error("Choose a valid date and time.");
  return parsed.toISOString();
}

async function requireLocationAccess(locationId: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect(`/login?next=${encodeURIComponent("/locations/dashboard/events-experiences?tab=events")}`);

  const access = await getLocationOwnerAccess(user.id, user.email ?? null);
  if (access.isAdmin) {
    if (!access.adminCanEdit) throw new Error("Your admin role is view-only for location changes.");
    return user;
  }

  const [{ data: owner }, { data: team }] = await Promise.all([
    supabaseAdmin.from("location_owner_locations").select("id").eq("location_id", locationId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
    supabaseAdmin.from("location_team_members").select("id").eq("location_id", locationId).eq("user_id", user.id).eq("invitation_status", "accepted").maybeSingle(),
  ]);
  if (!owner && !team) throw new Error("You do not have access to this location.");
  return user;
}

function revalidateEventWorkspaces() {
  revalidatePath("/events");
  revalidatePath("/locations/dashboard/events");
  revalidatePath("/locations/dashboard/events-experiences");
}

export async function createLocationEventAction(formData: FormData) {
  const locationId = value(formData, "location_id");
  if (!locationId) throw new Error("Location is required.");
  const user = await requireLocationAccess(locationId);
  const title = value(formData, "title");
  if (!title) throw new Error("Event title is required.");
  const startsAt = selectedDateTime(formData, "starts");
  if (!startsAt) throw new Error("Choose the event start date and time.");
  const endsAt = selectedDateTime(formData, "ends");
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) throw new Error("Event end must be after the start.");

  const slug = await allocatePublicSlug("events", title, optional(formData, "slug"));
  const isFree = formData.get("is_free") === "on";
  const ticketingEnabled = formData.get("ticketing_enabled") === "on";
  const capacityRaw = value(formData, "capacity");
  const capacity = capacityRaw ? Math.max(1, Number(capacityRaw)) : null;
  const priceRaw = value(formData, "price_min");
  const priceMin = isFree || !priceRaw ? null : Math.max(0, Number(priceRaw));
  const feePayer = ["customer", "organizer", "split"].includes(value(formData, "fee_payer")) ? value(formData, "fee_payer") : "customer";
  const customerFeeShareBps = feePayer === "customer" ? 10000 : feePayer === "split" ? 5000 : 0;
  const nativeId = crypto.randomUUID();

  const { data: event, error } = await supabaseAdmin.from("events").insert({
    location_id: locationId,
    source_kind: "native",
    title,
    slug,
    description: optional(formData, "description"),
    category: optional(formData, "category"),
    venue_name: optional(formData, "venue_name"),
    address: optional(formData, "address"),
    city: optional(formData, "city"),
    state: optional(formData, "state") || "NY",
    zip_code: optional(formData, "zip_code"),
    starts_at: startsAt,
    ends_at: endsAt,
    timezone: EASTERN_TIME_ZONE,
    image_url: optional(formData, "image_url"),
    status: "draft",
    searchable: false,
    is_free: isFree,
    price_min: priceMin,
    price_max: priceMin,
    currency: "USD",
    ticketing_enabled: ticketingEnabled,
    capacity,
    platform_fee_bps: 300,
    fee_payer: isFree ? "organizer" : feePayer,
    customer_fee_share_bps: isFree ? 0 : customerFeeShareBps,
    dedupe_fingerprint: `native:${nativeId}`,
    search_document: [title, optional(formData, "category"), optional(formData, "venue_name"), optional(formData, "city")].filter(Boolean).join(" "),
    metadata: { created_by_location: true, created_by_user_id: user.id },
  }).select("id").single();
  if (error || !event) throw error || new Error("Unable to create event.");

  const { error: sourceError } = await supabaseAdmin.from("event_sources").insert({
    event_id: event.id,
    provider: "native",
    provider_event_id: nativeId,
    provider_payload: { created_by_location: true, location_id: locationId },
  });
  if (sourceError) {
    await supabaseAdmin.from("events").delete().eq("id", event.id);
    throw sourceError;
  }

  revalidateEventWorkspaces();
  redirect(`/locations/dashboard/events-experiences?tab=events&locationId=${encodeURIComponent(locationId)}&notice=${encodeURIComponent("Event created as a draft.")}`);
}

export async function updateLocationEventStatusAction(formData: FormData) {
  const locationId = value(formData, "location_id");
  const eventId = value(formData, "event_id");
  const status = value(formData, "status");
  if (!locationId || !eventId || !["draft", "scheduled", "postponed", "cancelled", "completed"].includes(status)) throw new Error("Invalid event update.");
  await requireLocationAccess(locationId);
  const { data: event } = await supabaseAdmin.from("events").select("id,location_id,is_free,ticketing_enabled").eq("id", eventId).maybeSingle();
  if (!event || event.location_id !== locationId) throw new Error("Event not found.");

  if (status === "scheduled") {
    const [eventDecision, locationDecision] = await Promise.all([
      getFraudDecision("event", eventId),
      getFraudDecision("location", locationId),
    ]);
    const blockingDecision = [eventDecision, locationDecision].find(fraudDecisionPreventsSensitiveAction);
    if (blockingDecision) {
      throw new Error("This event is temporarily held for Trust & Safety review. Resolve the fraud case before publishing.");
    }
  }

  if (status === "scheduled" && !event.is_free && event.ticketing_enabled) {
    const { data: location } = await supabaseAdmin.from("locations").select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled").eq("id", locationId).maybeSingle();
    if (!location?.stripe_connect_account_id || !location.stripe_connect_charges_enabled || !location.stripe_connect_payouts_enabled) throw new Error("Finish TheOutHaven Payments setup before publishing a paid event.");

    const payoutDecision = await getFraudDecision("payout", `connect-account:${location.stripe_connect_account_id}`);
    if (fraudDecisionPreventsSensitiveAction(payoutDecision)) {
      throw new Error("Paid ticket sales are temporarily held for payment-risk review. Resolve the fraud case before publishing.");
    }
  }
  const searchable = status === "scheduled";
  const { error } = await supabaseAdmin.from("events").update({ status, searchable, updated_at: new Date().toISOString() }).eq("id", eventId).eq("location_id", locationId);
  if (error) throw error;
  revalidateEventWorkspaces();
}