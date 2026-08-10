import type { SupabaseClient } from "@supabase/supabase-js";
import type { EnterpriseLocation } from "../../enterprise/types";
import type { SearchPlan } from "../planner/searchPlanTypes";
import type { SearchTrace } from "../observability/searchTrace";
import type { RetrievalRequest } from "./retrievalTypes";

const MAX_EVENTS_PER_REQUEST = 30;
const PLANNED_EVENT_WINDOW_MS = 24 * 60 * 60 * 1000;
const EVENT_TIMEZONE = "America/New_York";

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

type EventTemporalWindow = {
  kind: "today" | "tonight" | "tomorrow" | "this_weekend";
  startsAt: string;
  endsAt: string;
};

function normalized(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
  };
}

function addLocalDays(parts: { year: number; month: number; day: number }, days: number) {
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function zonedDateTimeToUtc(parts: { year: number; month: number; day: number }, hour: number, minute: number, second: number, millisecond: number) {
  const desiredUtc = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute, second, millisecond);
  let guess = desiredUtc;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const rendered = new Intl.DateTimeFormat("en-US", {
      timeZone: EVENT_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(guess));
    const value = (type: Intl.DateTimeFormatPartTypes) => rendered.find((part) => part.type === type)?.value ?? "0";
    const renderedAsUtc = Date.UTC(
      Number(value("year")),
      Number(value("month")) - 1,
      Number(value("day")),
      Number(value("hour")),
      Number(value("minute")),
      Number(value("second")),
      millisecond,
    );
    guess += desiredUtc - renderedAsUtc;
  }
  return new Date(guess);
}

function localDayWindow(parts: { year: number; month: number; day: number }) {
  return {
    startsAt: zonedDateTimeToUtc(parts, 0, 0, 0, 0).toISOString(),
    endsAt: zonedDateTimeToUtc(parts, 23, 59, 59, 999).toISOString(),
  };
}

export function resolveExplicitEventTemporalWindow(rawQuery: string, now = new Date()): EventTemporalWindow | null {
  const query = normalized(rawQuery);
  const local = localDateParts(now);

  if (/\bthis weekend\b/.test(query) || /\bweekend\b/.test(query)) {
    const weekdayIndex = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(local.weekday);
    if (weekdayIndex < 0) return null;
    const saturday = addLocalDays(local, 6 - weekdayIndex);
    const sunday = addLocalDays(local, 7 - weekdayIndex);
    // On Sunday, "this weekend" refers to the weekend currently in progress,
    // not the following Saturday/Sunday.
    const resolvedSaturday = weekdayIndex === 0 ? addLocalDays(local, -1) : saturday;
    const resolvedSunday = weekdayIndex === 0 ? local : sunday;
    return {
      kind: "this_weekend",
      startsAt: zonedDateTimeToUtc(resolvedSaturday, 0, 0, 0, 0).toISOString(),
      endsAt: zonedDateTimeToUtc(resolvedSunday, 23, 59, 59, 999).toISOString(),
    };
  }

  if (/\btomorrow\b/.test(query)) {
    const window = localDayWindow(addLocalDays(local, 1));
    return { kind: "tomorrow", ...window };
  }

  if (/\btonight\b/.test(query)) {
    const window = localDayWindow(local);
    return { kind: "tonight", ...window };
  }

  if (/\btoday\b/.test(query)) {
    const window = localDayWindow(local);
    return { kind: "today", ...window };
  }

  return null;
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

function eventMatchesPlannedTime(event: EventSearchRow, plannedFor: string | null) {
  if (!plannedFor) return true;
  const target = new Date(plannedFor).getTime();
  const starts = new Date(event.starts_at).getTime();
  if (!Number.isFinite(target) || !Number.isFinite(starts)) return true;
  return Math.abs(starts - target) <= PLANNED_EVENT_WINDOW_MS;
}

function eventOverlapsWindow(event: EventSearchRow, window: EventTemporalWindow) {
  const starts = new Date(event.starts_at).getTime();
  const ends = new Date(event.ends_at ?? event.starts_at).getTime();
  const windowStart = new Date(window.startsAt).getTime();
  const windowEnd = new Date(window.endsAt).getTime();
  if (![starts, ends, windowStart, windowEnd].every(Number.isFinite)) return false;
  return starts <= windowEnd && ends >= windowStart;
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
  const temporalWindow = resolveExplicitEventTemporalWindow(plan.rawQuery, now);
  const lookback = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  try {
    let query = supabase
      .from("events")
      .select("id,organization_id,location_id,title,description,category,subcategory,venue_name,address,city,state,zip_code,market,borough,county,latitude,longitude,starts_at,ends_at,timezone,all_day,price_min,price_max,currency,is_free,external_url,image_url,status,searchable,search_document")
      .eq("searchable", true)
      .in("status", ["scheduled", "postponed"])
      .gte("starts_at", temporalWindow?.startsAt ?? lookback)
      .order("starts_at", { ascending: true })
      .limit(120);

    if (temporalWindow) query = query.lte("starts_at", temporalWindow.endsAt);
    if (plan.geo.city) query = query.ilike("city", plan.geo.city);
    else if (plan.geo.borough) query = query.ilike("borough", plan.geo.borough);
    else if (plan.geo.county) query = query.ilike("county", plan.geo.county);
    else if (plan.geo.market) query = query.ilike("market", plan.geo.market);

    const { data, error } = await query;
    if (error) throw error;

    const liveRows = ((data ?? []) as EventSearchRow[]).filter((event) => {
      const effectiveEnd = new Date(event.ends_at ?? event.starts_at).getTime();
      if (!Number.isFinite(effectiveEnd) || effectiveEnd < now.getTime()) return false;
      if (temporalWindow) return eventOverlapsWindow(event, temporalWindow);
      return eventMatchesPlannedTime(event, plan.plannedFor);
    });

    const projected: Array<{ location: EnterpriseLocation; request: RetrievalRequest }> = [];
    for (const request of activityRequests) {
      const matching = liveRows.filter((event) => eventMatchesRequest(event, request)).slice(0, MAX_EVENTS_PER_REQUEST);
      for (const event of matching) projected.push({ location: projectEventToSearchLocation(event), request });
    }

    trace.decisions.push({
      stage: "event_retrieval",
      decision: "canonical_events_retrieved",
      reason: JSON.stringify({
        rows: liveRows.length,
        candidates: projected.length,
        requestCount: activityRequests.length,
        maxPerRequest: MAX_EVENTS_PER_REQUEST,
        plannedFor: plan.plannedFor,
        temporalWindow,
      }),
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
