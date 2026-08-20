"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const EVENT_STATUSES = new Set(["draft", "scheduled", "postponed", "cancelled", "completed"]);
const EVENT_FEE_PAYERS = new Set(["customer", "organizer", "split"]);

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function optional(formData: FormData, key: string) {
  const raw = value(formData, key);
  return raw || null;
}

function asIso(raw: string) {
  const parsed = new Date(raw);
  if (!raw || Number.isNaN(parsed.getTime())) throw new Error("Invalid event date/time");
  return parsed.toISOString();
}

async function requireOrganizationMember(organizationId: string) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect(`/login?next=${encodeURIComponent("/organizers/dashboard")}`);

  const { data: membership, error } = await supabaseAdmin
    .from("organization_members")
    .select("id,role,status")
    .eq("organization_id", organizationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !membership) throw new Error("You do not have access to this organization");
  return { user, membership };
}

function redirectWithNotice(organizationId: string, notice: string) {
  redirect(`/organizers/dashboard?organizationId=${encodeURIComponent(organizationId)}&notice=${encodeURIComponent(notice)}`);
}

export async function createOrganizerEventAction(formData: FormData) {
  const organizationId = value(formData, "organization_id");
  if (!organizationId) throw new Error("Organization is required");
  const { user } = await requireOrganizationMember(organizationId);

  const title = value(formData, "title");
  if (!title) throw new Error("Event title is required");
  const startsAt = asIso(value(formData, "starts_at"));
  const endsRaw = value(formData, "ends_at");
  const endsAt = endsRaw ? asIso(endsRaw) : null;
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error("Event end must be after its start");
  }

  const capacityRaw = value(formData, "capacity");
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1)) throw new Error("Capacity must be at least 1");

  const isFree = formData.get("is_free") === "on";
  const ticketingEnabled = formData.get("ticketing_enabled") === "on";
  const priceRaw = value(formData, "price_min");
  const priceMin = isFree || !priceRaw ? null : Number(priceRaw);
  if (priceMin != null && (!Number.isFinite(priceMin) || priceMin <= 0)) throw new Error("Paid tickets require a positive ticket price");

  const requestedFeePayer = value(formData, "fee_payer") || "customer";
  const feePayer = EVENT_FEE_PAYERS.has(requestedFeePayer) ? requestedFeePayer : "customer";
  const customerFeeShareBps = feePayer === "customer" ? 10000 : feePayer === "split" ? 5000 : 0;

  const nativeId = crypto.randomUUID();
  const category = optional(formData, "category");
  const venueName = optional(formData, "venue_name");
  const city = optional(formData, "city");

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .insert({
      organization_id: organizationId,
      source_kind: "native",
      title,
      description: optional(formData, "description"),
      category,
      venue_name: venueName,
      address: optional(formData, "address"),
      city,
      state: optional(formData, "state") || "NY",
      zip_code: optional(formData, "zip_code"),
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: optional(formData, "timezone") || "America/New_York",
      image_url: optional(formData, "image_url"),
      status: "draft",
      searchable: false,
      is_free: isFree,
      price_min: priceMin,
      price_max: priceMin,
      currency: "USD",
      ticketing_enabled: ticketingEnabled,
      capacity,
      platform_fee_bps: 500,
      fee_payer: isFree ? "organizer" : feePayer,
      customer_fee_share_bps: isFree ? 0 : customerFeeShareBps,
      dedupe_fingerprint: `native:${nativeId}`,
      search_document: [title, category, venueName, city].filter(Boolean).join(" "),
      metadata: {
        created_by_organizer: true,
        created_by_user_id: user.id,
        organizer_submission_status: "draft",
      },
    })
    .select("id")
    .single();

  if (error || !event) throw error || new Error("Unable to create event");

  const { error: sourceError } = await supabaseAdmin.from("event_sources").insert({
    event_id: event.id,
    provider: "native",
    provider_event_id: nativeId,
    provider_payload: { created_by_organizer: true, organization_id: organizationId },
  });

  if (sourceError) {
    await supabaseAdmin.from("events").delete().eq("id", event.id);
    throw sourceError;
  }

  revalidatePath("/organizers/dashboard");
  redirectWithNotice(organizationId, "Event created as a draft. Review the details, then submit it for publishing.");
}

export async function updateOrganizerEventLifecycleAction(formData: FormData) {
  const organizationId = value(formData, "organization_id");
  const eventId = value(formData, "event_id");
  const status = value(formData, "status");
  if (!organizationId || !eventId || !EVENT_STATUSES.has(status)) throw new Error("Invalid event update");
  await requireOrganizationMember(organizationId);

  const { data: event, error: eventError } = await supabaseAdmin
    .from("events")
    .select("id,organization_id,source_kind,is_free,ticketing_enabled")
    .eq("id", eventId)
    .maybeSingle();
  if (eventError || !event || event.organization_id !== organizationId || event.source_kind !== "native") {
    throw new Error("Event not found");
  }

  if (status === "scheduled" && !event.is_free && event.ticketing_enabled) {
    const { data: organization, error: organizationError } = await supabaseAdmin
      .from("organizations")
      .select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled")
      .eq("id", organizationId)
      .maybeSingle();
    if (organizationError) throw organizationError;
    if (!organization?.stripe_connect_account_id || !organization.stripe_connect_charges_enabled || !organization.stripe_connect_payouts_enabled) {
      throw new Error("Finish TheOutHaven Payments setup before scheduling a paid event.");
    }
  }

  const nextSearchable = status === "cancelled" || status === "completed" ? false : undefined;
  const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (nextSearchable === false) updates.searchable = false;

  const { error } = await supabaseAdmin.from("events").update(updates).eq("id", eventId).eq("organization_id", organizationId);
  if (error) throw error;

  revalidatePath("/organizers/dashboard");
  redirectWithNotice(organizationId, "Event status updated.");
}
