import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveSearchMlRuntimeConfig } from "../../huggingFaceEmbedding";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";
import { buildHfSearchQueryDocument } from "./retrieveHfSemanticRows";
import { projectEventToSearchLocation, resolveExplicitEventTemporalWindow } from "./retrieveEventLocations";
import { SEARCH_LOCATION_SELECT } from "./locationSearchSelect";
import { fetchSearchQueryEmbedding } from "./fetchSearchQueryEmbedding";

function isActivityRequest(request: RetrievalRequest) {
  return request.desiredRole === "general_activity" || request.desiredRole.endsWith("_activity");
}

function overlaps(startsAt: string | null | undefined, endsAt: string | null | undefined, window: { startsAt: string; endsAt: string } | null) {
  if (!window) return true;
  const starts = new Date(startsAt ?? "").getTime();
  const ends = new Date(endsAt ?? startsAt ?? "").getTime();
  const windowStart = new Date(window.startsAt).getTime();
  const windowEnd = new Date(window.endsAt).getTime();
  return [starts, ends, windowStart, windowEnd].every(Number.isFinite) && starts <= windowEnd && ends >= windowStart;
}

function nearPlannedTime(startsAt: string | null | undefined, plannedFor: string | null) {
  if (!plannedFor || !startsAt) return true;
  const target = new Date(plannedFor).getTime();
  const starts = new Date(startsAt).getTime();
  if (!Number.isFinite(target) || !Number.isFinite(starts)) return true;
  return Math.abs(starts - target) <= 24 * 60 * 60 * 1000;
}

function projectExperience(row: any, parent: any, slot: any | null, similarity: number) {
  const publicSlug = row.slug || row.id;
  return {
    ...(parent ?? {}),
    id: `experience:${row.id}`,
    experience_id: row.id,
    organization_id: row.organization_id,
    canonical_location_id: row.location_id,
    inventory_type: "experience",
    location_type: "experience",
    type: "activity",
    name: row.title,
    activity_name: row.title,
    description: row.description,
    activity_type: row.category ?? row.experience_type ?? "experience",
    primary_category: row.category ?? row.experience_type ?? "experience",
    categories: [row.category, row.experience_type].filter(Boolean),
    tags: [row.category, row.experience_type].filter(Boolean),
    search_keywords: [row.category, row.experience_type, "experience"].filter(Boolean),
    venue_name: row.venue_name ?? parent?.name ?? null,
    address: row.address ?? parent?.address ?? null,
    city: row.city ?? parent?.city ?? null,
    state: row.state ?? parent?.state ?? null,
    zip_code: row.zip_code ?? parent?.zip_code ?? null,
    latitude: parent?.latitude ?? null,
    longitude: parent?.longitude ?? null,
    image_url: row.image_url ?? parent?.image_url ?? parent?.main_image ?? null,
    website: `/experiences/${publicSlug}`,
    booking_url: `/experiences/${publicSlug}`,
    public_url: `/experiences/${publicSlug}`,
    status: "active",
    is_searchable: true,
    experience_status: row.status,
    experience_starts_at: slot?.starts_at ?? null,
    experience_ends_at: slot?.ends_at ?? null,
    experience_duration_minutes: row.duration_minutes,
    experience_price_per_person: row.price_per_person,
    experience_currency: row.currency,
    hf_inventory_similarity: similarity,
  };
}

export async function retrieveHfInventoryRows({
  plan,
  supabase,
  requests,
  trace,
}: {
  plan: SearchPlan;
  supabase: SupabaseClient;
  requests: RetrievalRequest[];
  trace: SearchTrace;
}) {
  const activityRequests = requests.filter(isActivityRequest);
  if (!activityRequests.length) return [] as Array<{ location: any; request: RetrievalRequest }>;
  const config = await resolveSearchMlRuntimeConfig();
  if (config.semanticMode === "disabled") return [] as Array<{ location: any; request: RetrievalRequest }>;

  const started = performance.now();
  try {
    const queryEmbedding = await fetchSearchQueryEmbedding(buildHfSearchQueryDocument(plan), { timeoutMs: 900 });
    const { data: matches, error } = await supabase.rpc("match_hf_search_inventory_embeddings", {
      p_query_embedding: queryEmbedding,
      p_source_kinds: ["event", "experience"],
      p_market_key: plan.geo.market,
      p_match_count: Math.max(10, Math.min(60, Number(process.env.SEARCH_HF_INVENTORY_MATCH_COUNT || 40))),
      p_min_similarity: Number(process.env.SEARCH_HF_INVENTORY_MIN_SIMILARITY || 0.48),
      p_embedding_version: config.embeddingVersion,
    });
    if (error) throw error;

    const eventMatches = (matches ?? []).filter((row: any) => row.source_kind === "event");
    const experienceMatches = (matches ?? []).filter((row: any) => row.source_kind === "experience");
    const eventIds = eventMatches.map((row: any) => row.source_id);
    const experienceIds = experienceMatches.map((row: any) => row.source_id);
    const [eventsResult, experiencesResult] = await Promise.all([
      eventIds.length
        ? supabase.from("events").select("id,source_kind,organization_id,location_id,title,description,category,subcategory,venue_name,address,city,state,zip_code,market,borough,county,latitude,longitude,starts_at,ends_at,timezone,all_day,price_min,price_max,currency,is_free,external_url,image_url,status,searchable,search_document,slug").in("id", eventIds)
        : Promise.resolve({ data: [] as any[], error: null }),
      experienceIds.length
        ? supabase.from("experiences").select("id,organization_id,location_id,title,description,category,image_url,venue_name,address,city,state,zip_code,duration_minutes,min_party_size,max_party_size,price_per_person,currency,status,searchable,slug,experience_type").in("id", experienceIds)
        : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    if (eventsResult.error) throw eventsResult.error;
    if (experiencesResult.error) throw experiencesResult.error;

    const temporalWindow = resolveExplicitEventTemporalWindow(plan.rawQuery, new Date());
    const similarityByKey = new Map<string, number>(
      (matches ?? []).map((row: any): [string, number] => [
        `${row.source_kind}:${row.source_id}`,
        Number(row.similarity ?? 0),
      ]),
    );
    const projected: Array<{ location: any; request: RetrievalRequest }> = [];

    for (const event of eventsResult.data ?? []) {
      if (!event.searchable || !["scheduled", "postponed"].includes(String(event.status))) continue;
      if (!overlaps(event.starts_at, event.ends_at, temporalWindow)) continue;
      if (!nearPlannedTime(event.starts_at, plan.plannedFor)) continue;
      const similarity = similarityByKey.get(`event:${event.id}`) ?? 0;
      const location = { ...projectEventToSearchLocation(event as any), hf_inventory_similarity: similarity };
      for (const request of activityRequests) projected.push({ location, request });
    }

    const experienceRows = experiencesResult.data ?? [];
    const parentIds = [...new Set(experienceRows.map((row: any) => row.location_id).filter(Boolean))];
    const [{ data: parents, error: parentError }, { data: slots, error: slotError }] = await Promise.all([
      parentIds.length ? supabase.from("locations").select(SEARCH_LOCATION_SELECT).in("id", parentIds) : Promise.resolve({ data: [] as any[], error: null }),
      experienceIds.length ? supabase.from("experience_slots").select("id,experience_id,starts_at,ends_at,status,capacity,tables_available").in("experience_id", experienceIds).gte("ends_at", new Date().toISOString()).order("starts_at", { ascending: true }).limit(250) : Promise.resolve({ data: [] as any[], error: null }),
    ]);
    if (parentError) throw parentError;
    if (slotError) throw slotError;
    const parentById = new Map((parents ?? []).map((row: any) => [String(row.id), row]));
    const slotsByExperience = new Map<string, any[]>();
    for (const slot of slots ?? []) {
      if (["cancelled", "canceled", "closed"].includes(String(slot.status).toLowerCase())) continue;
      const key = String(slot.experience_id);
      slotsByExperience.set(key, [...(slotsByExperience.get(key) ?? []), slot]);
    }
    const timeSpecific = Boolean(temporalWindow || plan.plannedFor);
    for (const experience of experienceRows) {
      if (!experience.searchable || !["published", "active", "scheduled"].includes(String(experience.status))) continue;
      const availableSlots = slotsByExperience.get(String(experience.id)) ?? [];
      const matchingSlot = availableSlots.find((slot) => overlaps(slot.starts_at, slot.ends_at, temporalWindow) && nearPlannedTime(slot.starts_at, plan.plannedFor)) ?? null;
      if (timeSpecific && !matchingSlot) continue;
      const similarity = similarityByKey.get(`experience:${experience.id}`) ?? 0;
      const location = projectExperience(experience, parentById.get(String(experience.location_id)), matchingSlot, similarity);
      for (const request of activityRequests) projected.push({ location, request });
    }

    trace.decisions.push({
      stage: "hf_inventory_semantic_retrieval",
      decision: projected.length ? "semantic_inventory_candidates_added" : "semantic_inventory_no_match",
      reason: JSON.stringify({
        matches: (matches ?? []).length,
        eventMatches: eventMatches.length,
        experienceMatches: experienceMatches.length,
        projected: projected.length,
        temporalWindow,
        latencyMs: performance.now() - started,
        queryEmbeddingDeduplicated: true,
      }),
    });
    return projected;
  } catch (error) {
    trace.decisions.push({
      stage: "hf_inventory_semantic_retrieval",
      decision: "semantic_inventory_fail_open",
      reason: error instanceof Error ? error.message : "unknown_inventory_semantic_error",
    });
    return [] as Array<{ location: any; request: RetrievalRequest }>;
  }
}