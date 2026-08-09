import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";

type EventSearchRow = {
  id: string;
  organization_id: string | null;
  location_id: string | null;
  title: string;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  venue_name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  market: string | null;
  borough: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  starts_at: string;
  ends_at: string | null;
  timezone: string;
  all_day: boolean;
  price_min: number | null;
  price_max: number | null;
  currency: string | null;
  is_free: boolean;
  external_url: string | null;
  image_url: string | null;
  status: string;
  searchable: boolean;
  search_document: string;
};

function normalized(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function eventMatchesRequest(event: EventSearchRow, request: RetrievalRequest) {
  if (!request.desiredRole.endsWith("_activity")) return false;
  if (request.categories.length === 0) return true;

  const haystack = normalized([
    event.title,
    event.description,
    event.category,
    event.subcategory,
    event.venue_name,
    event.search_document,
  ].filter(Boolean).join(" "));

  const terms = [...request.categories, ...request.features, ...request.retrievalTerms]
    .map(normalized)
    .filter(Boolean);
  return terms.some((term) => (` ${haystack} `).includes(` ${term} `));
}

export function projectEventToSearchLocation(event: EventSearchRow): EnterpriseLocation {
  const categories = [event.category, event.subcategory].filter((value): value is string => Boolean(value));
  return {
    id: `event:${event.id}`,
    event_id: event.id,
    organization_id: event.organization_id,
    canonical_location_id: event.location_id,
    inventory_type: "event",
    location_type: "event",
    type: "activity",
    name: event.title,
    activity_name: event.title,
    description: event.description,
    activity_type: event.category ?? "event",
    primary_category: event.category ?? "event",
    categories,
    tags: categories,
    search_keywords: categories,
    search_document: event.search_document,
    venue_name: event.venue_name,
    address: event.address,
    city: event.city,
    state: event.state,
    zip_code: event.zip_code,
    market: event.market,
    borough: event.borough,
    county: event.county,
    latitude: event.latitude,
    longitude: event.longitude,
    image_url: event.image_url,
    website: event.external_url,
    booking_url: event.external_url,
    public_url: `/events/${event.id}`,
    status: "active",
    is_searchable: true,
    event_status: event.status,
    event_starts_at: event.starts_at,
    event_ends_at: event.ends_at,
    event_timezone: event.timezone,
    event_all_day: event.all_day,
    event_price_min: event.price_min,
    event_price_max: event.price_max,
    event_currency: event.currency,
    event_is_free: event.is_free,
  };
}

export async function retrieveEventLocations({
  supabase,
  requests,
  plan,
  trace,
}: {
  supabase: SupabaseClient;
  requests: RetrievalRequest[];
  plan: SearchPlan;
  trace: SearchTrace;
}) {
  const activityRequests = requests.filter((request) => request.desiredRole.endsWith("_activity"));
  if (activityRequests.length === 0) return [] as Array<{ location: EnterpriseLocation; request: RetrievalRequest }>;

  const now = new Date();
  const lookback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    let query = supabase
      .from("events")
      .select("id,organization_id,location_id,title,description,category,subcategory,venue_name,address,city,state,zip_code,market,borough,county,latitude,longitude,starts_at,ends_at,timezone,all_day,price_min,price_max,currency,is_free,external_url,image_url,status,searchable,search_document")
      .eq("searchable", true)
      .in("status", ["scheduled", "postponed"])
      .gte("starts_at", lookback)
      .order("starts_at", { ascending: true })
      .limit(120);

    if (plan.geo.city) query = query.ilike("city", plan.geo.city);
    else if (plan.geo.borough) query = query.ilike("borough", plan.geo.borough);
    else if (plan.geo.county) query = query.ilike("county", plan.geo.county);
    else if (plan.geo.market) query = query.ilike("market", plan.geo.market);

    const { data, error } = await query;
    if (error) throw error;

    const liveRows = ((data ?? []) as EventSearchRow[]).filter((event) => {
      const effectiveEnd = new Date(event.ends_at ?? event.starts_at).getTime();
      return Number.isFinite(effectiveEnd) && effectiveEnd >= now.getTime();
    });

    const projected: Array<{ location: EnterpriseLocation; request: RetrievalRequest }> = [];
    for (const event of liveRows) {
      for (const request of activityRequests) {
        if (eventMatchesRequest(event, request)) projected.push({ location: projectEventToSearchLocation(event), request });
      }
    }

    trace.decisions.push({
      stage: "event_retrieval",
      decision: "canonical_events_retrieved",
      reason: JSON.stringify({ rows: liveRows.length, candidates: projected.length, requestCount: activityRequests.length }),
    });
    return projected;
  } catch (error) {
    // Event inventory deploys additively. Existing restaurant/activity search must
    // remain healthy if the migration is not applied yet or event retrieval fails.
    trace.decisions.push({
      stage: "event_retrieval",
      decision: "canonical_events_unavailable_fail_open",
      reason: error instanceof Error ? error.message : "unknown event retrieval failure",
    });
    return [] as Array<{ location: EnterpriseLocation; request: RetrievalRequest }>;
  }
}
