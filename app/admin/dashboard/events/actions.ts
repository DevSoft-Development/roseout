"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const EVENT_STATUSES = new Set(["draft", "scheduled", "postponed", "cancelled", "completed"]);

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function optional(formData: FormData, key: string) {
  const v = value(formData, key);
  return v || null;
}

function optionalNumber(formData: FormData, key: string) {
  const raw = value(formData, key);
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${key} must be a positive number`);
  return parsed;
}

function asIso(input: string) {
  const date = new Date(input);
  if (!input || Number.isNaN(date.getTime())) throw new Error("Invalid event date/time");
  return date.toISOString();
}

function notice(message: string) {
  redirect(`/admin/dashboard/events?notice=${encodeURIComponent(message)}`);
}

function managedEventValues(formData: FormData) {
  const title = value(formData, "title");
  if (!title) throw new Error("Event title is required");

  const startsAt = asIso(value(formData, "starts_at"));
  const endsRaw = value(formData, "ends_at");
  const endsAt = endsRaw ? asIso(endsRaw) : null;
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error("Event end must be after its start");
  }

  const isFree = formData.get("is_free") === "on";
  const priceMin = isFree ? 0 : optionalNumber(formData, "price_min");
  const priceMax = isFree ? 0 : optionalNumber(formData, "price_max");
  if (priceMin !== null && priceMax !== null && priceMax < priceMin) {
    throw new Error("Maximum price must be greater than or equal to minimum price");
  }

  const capacityRaw = value(formData, "capacity");
  const capacity = capacityRaw ? Number(capacityRaw) : null;
  if (capacity != null && (!Number.isInteger(capacity) || capacity < 1)) throw new Error("Capacity must be at least 1");

  const category = optional(formData, "category");
  const venueName = optional(formData, "venue_name");
  const city = optional(formData, "city");

  return {
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
    price_min: priceMin,
    price_max: priceMax,
    currency: isFree ? "USD" : optional(formData, "currency") || (priceMin !== null || priceMax !== null ? "USD" : null),
    is_free: isFree,
    external_url: optional(formData, "external_url"),
    image_url: optional(formData, "image_url"),
    ticketing_enabled: formData.get("ticketing_enabled") === "on",
    capacity,
    search_document: [title, category, venueName, city].filter(Boolean).join(" "),
  };
}

async function requireNativeEvent(id: string) {
  const existing = await supabaseAdmin.from("events").select("id,source_kind").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data || existing.data.source_kind !== "native") {
    throw new Error("This workspace only manages TheOutHaven-created events");
  }
}

export async function createNativeEventAction(formData: FormData) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.eventsManage);

  const fields = managedEventValues(formData);
  const nativeId = crypto.randomUUID();
  const status = value(formData, "status") || "draft";
  if (!EVENT_STATUSES.has(status)) throw new Error("Invalid event status");
  const searchable = formData.get("searchable") === "on" && status === "scheduled";

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .insert({
      ...fields,
      source_kind: "native",
      status,
      searchable,
      dedupe_fingerprint: `native:${nativeId}`,
      metadata: { created_by_admin: true, managed_by: "theouthaven" },
    })
    .select("id")
    .single();

  if (error || !event) throw error || new Error("Unable to create event");

  const { error: sourceError } = await supabaseAdmin.from("event_sources").insert({
    event_id: event.id,
    provider: "native",
    provider_event_id: nativeId,
    provider_payload: { created_by_admin: true, managed_by: "theouthaven" },
  });

  if (sourceError) {
    await supabaseAdmin.from("events").delete().eq("id", event.id);
    throw sourceError;
  }

  revalidatePath("/admin/dashboard/events");
  notice("TheOutHaven event created");
}

export async function updateEventLifecycleAction(formData: FormData) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.eventsManage);

  const id = value(formData, "id");
  const status = value(formData, "status");
  if (!id || !EVENT_STATUSES.has(status)) throw new Error("Invalid event update");
  await requireNativeEvent(id);

  const searchable = formData.get("searchable") === "on" && status === "scheduled";
  const { error } = await supabaseAdmin
    .from("events")
    .update({ status, searchable, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("source_kind", "native");
  if (error) throw error;

  revalidatePath("/admin/dashboard/events");
}

export async function updateNativeEventAction(formData: FormData) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.eventsManage);

  const id = value(formData, "id");
  if (!id) throw new Error("Event id is required");
  await requireNativeEvent(id);

  const fields = managedEventValues(formData);
  const { error } = await supabaseAdmin
    .from("events")
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("source_kind", "native");
  if (error) throw error;

  revalidatePath("/admin/dashboard/events");
  notice("Event details updated");
}
