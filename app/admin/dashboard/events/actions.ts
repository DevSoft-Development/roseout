"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { runEventProviderIngestion } from "@/lib/events/ingestion";

const EVENT_STATUSES = new Set(["draft", "scheduled", "postponed", "cancelled", "completed"]);

function value(formData: FormData, key: string) {
  const raw = formData.get(key);
  return typeof raw === "string" ? raw.trim() : "";
}

function optional(formData: FormData, key: string) {
  const v = value(formData, key);
  return v || null;
}

function asIso(input: string) {
  const date = new Date(input);
  if (!input || Number.isNaN(date.getTime())) throw new Error("Invalid event date/time");
  return date.toISOString();
}

function notice(message: string) {
  redirect(`/admin/dashboard/events?notice=${encodeURIComponent(message)}`);
}

export async function createNativeEventAction(formData: FormData) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.eventsManage);

  const title = value(formData, "title");
  if (!title) throw new Error("Event title is required");

  const startsAt = asIso(value(formData, "starts_at"));
  const endsRaw = value(formData, "ends_at");
  const endsAt = endsRaw ? asIso(endsRaw) : null;
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error("Event end must be after its start");
  }

  const nativeId = crypto.randomUUID();
  const status = value(formData, "status") || "draft";
  if (!EVENT_STATUSES.has(status)) throw new Error("Invalid event status");
  const searchable = formData.get("searchable") === "on" && status === "scheduled";

  const { data: event, error } = await supabaseAdmin
    .from("events")
    .insert({
      source_kind: "native",
      title,
      description: optional(formData, "description"),
      category: optional(formData, "category"),
      venue_name: optional(formData, "venue_name"),
      address: optional(formData, "address"),
      city: optional(formData, "city"),
      state: optional(formData, "state") || "NY",
      zip_code: optional(formData, "zip_code"),
      starts_at: startsAt,
      ends_at: endsAt,
      timezone: optional(formData, "timezone") || "America/New_York",
      external_url: optional(formData, "external_url"),
      image_url: optional(formData, "image_url"),
      status,
      searchable,
      dedupe_fingerprint: `native:${nativeId}`,
      search_document: [title, optional(formData, "category"), optional(formData, "venue_name"), optional(formData, "city")]
        .filter(Boolean)
        .join(" "),
      metadata: { created_by_admin: true },
    })
    .select("id")
    .single();

  if (error || !event) throw error || new Error("Unable to create event");

  const { error: sourceError } = await supabaseAdmin.from("event_sources").insert({
    event_id: event.id,
    provider: "native",
    provider_event_id: nativeId,
    provider_payload: { created_by_admin: true },
  });

  if (sourceError) {
    await supabaseAdmin.from("events").delete().eq("id", event.id);
    throw sourceError;
  }

  revalidatePath("/admin/dashboard/events");
  notice("Native event created");
}

export async function updateEventLifecycleAction(formData: FormData) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.eventsManage);

  const id = value(formData, "id");
  const status = value(formData, "status");
  if (!id || !EVENT_STATUSES.has(status)) throw new Error("Invalid event update");

  const searchable = formData.get("searchable") === "on" && status === "scheduled";
  const { error } = await supabaseAdmin
    .from("events")
    .update({ status, searchable, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/dashboard/events");
}

export async function updateNativeEventAction(formData: FormData) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.eventsManage);

  const id = value(formData, "id");
  if (!id) throw new Error("Event id is required");

  const existing = await supabaseAdmin.from("events").select("source_kind").eq("id", id).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.source_kind !== "native") throw new Error("Provider event content is refreshed from its source and cannot be edited here");

  const title = value(formData, "title");
  if (!title) throw new Error("Event title is required");

  const startsAt = asIso(value(formData, "starts_at"));
  const endsRaw = value(formData, "ends_at");
  const endsAt = endsRaw ? asIso(endsRaw) : null;
  if (endsAt && new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
    throw new Error("Event end must be after its start");
  }

  const category = optional(formData, "category");
  const venueName = optional(formData, "venue_name");
  const city = optional(formData, "city");
  const { error } = await supabaseAdmin
    .from("events")
    .update({
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
      external_url: optional(formData, "external_url"),
      image_url: optional(formData, "image_url"),
      search_document: [title, category, venueName, city].filter(Boolean).join(" "),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;

  revalidatePath("/admin/dashboard/events");
  notice("Event details updated");
}

export async function runEventIngestionAction(formData: FormData) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.eventsImport);

  const requested = ["ticketmaster", "nyc_events", "nyc_parks"].filter((provider) => formData.get(provider) === "on") as Array<
    "ticketmaster" | "nyc_events" | "nyc_parks"
  >;
  const result = await runEventProviderIngestion({ providers: requested.length ? requested : undefined });
  revalidatePath("/admin/dashboard/events");

  const imported = result.providers.reduce((sum, provider) => sum + provider.counts.inserted + provider.counts.updated + provider.counts.deduped, 0);
  const failed = result.providers.reduce((sum, provider) => sum + provider.counts.failed, 0);
  notice(`Event ingestion finished: ${imported} processed, ${failed} failed`);
}
