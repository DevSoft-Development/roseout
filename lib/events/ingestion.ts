import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeProviderEvents } from "./providers";
import { classifyNycConsumerEventEligibility } from "./providers/consumerEligibility";
import { upsertCanonicalEvent } from "./repository";
import type { CanonicalEventInput, EventProvider, NormalizedEvent } from "./types";

type Provider = Exclude<EventProvider, "native">;

type ProviderConfig = {
  provider: Provider;
  url: string | null;
  pageSize: number;
  maxPages: number;
};

export type EventImportCounts = {
  fetched: number;
  normalized: number;
  inserted: number;
  updated: number;
  deduped: number;
  skipped: number;
  failed: number;
};

export type EventProviderImportResult = {
  provider: Provider;
  configured: boolean;
  success: boolean;
  pages: number;
  counts: EventImportCounts;
  error?: string;
};

export type EventIngestionOptions = {
  providers?: Provider[];
  maxPages?: number;
  pageSize?: number;
  now?: Date;
  supabase?: SupabaseClient;
  fetchImpl?: typeof fetch;
};

const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 3;
const HARD_MAX_PAGES = 5;
const HARD_MAX_PAGE_SIZE = 200;
const EXPIRE_SWEEP_LIMIT = 500;
const QUALITY_SWEEP_LIMIT = 500;
const NYC_PERMITTED_EVENTS_DATASET_ID = "tvpp-9vvx";
const ARCHIVED_NYC_PARKS_DATASET_ID = "fudw-fgrp";
const NYC_EVENT_PROVIDERS = new Set(["nyc_events", "nyc_parks"]);

function clampInteger(value: number | undefined, fallback: number, min: number, max: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value as number), min), max);
}

function emptyCounts(): EventImportCounts {
  return { fetched: 0, normalized: 0, inserted: 0, updated: 0, deduped: 0, skipped: 0, failed: 0 };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error || "Unknown event ingestion failure");
}

function providerConfig(provider: Provider, pageSize: number, maxPages: number): ProviderConfig {
  if (provider === "ticketmaster") {
    return {
      provider,
      url: process.env.TICKETMASTER_DISCOVERY_API_URL?.trim() || "https://app.ticketmaster.com/discovery/v2/events.json",
      pageSize,
      maxPages,
    };
  }
  if (provider === "nyc_events") {
    return { provider, url: process.env.NYC_EVENTS_API_URL?.trim() || null, pageSize, maxPages };
  }
  return { provider, url: process.env.NYC_PARKS_EVENTS_API_URL?.trim() || null, pageSize, maxPages };
}

function isNycOpenDataResource(url: URL, datasetId: string) {
  return url.hostname === "data.cityofnewyork.us" && url.pathname.includes(`/resource/${datasetId}.json`);
}

function combineWhere(existingWhere: string | null, clauses: string[]) {
  const parts = [existingWhere?.trim(), ...clauses].filter((value): value is string => Boolean(value));
  if (parts.length === 0) return null;
  return parts.map((part) => `(${part})`).join(" AND ");
}

function nycProviderConfigurationError(provider: Provider, url: string | null) {
  if (!url) {
    if (provider === "ticketmaster") return "TICKETMASTER_API_KEY is not configured.";
    return `${provider === "nyc_events" ? "NYC_EVENTS_API_URL" : "NYC_PARKS_EVENTS_API_URL"} is not configured.`;
  }

  if (provider === "nyc_parks") {
    try {
      const parsed = new URL(url);
      if (isNycOpenDataResource(parsed, ARCHIVED_NYC_PARKS_DATASET_ID)) {
        return "NYC_PARKS_EVENTS_API_URL points to the archived NYC Parks Events Listing dataset (fudw-fgrp), whose inventory ends in 2019. Configure a current feed before importing NYC Parks events.";
      }
    } catch {
      return "NYC_PARKS_EVENTS_API_URL is not a valid URL.";
    }
  }

  return null;
}

export function buildEventProviderPageUrl(provider: Provider, page: number, pageSize: number, now: Date) {
  const config = providerConfig(provider, pageSize, 1);
  if (!config.url) return null;
  const url = new URL(config.url);

  if (provider === "ticketmaster") {
    const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
    if (!apiKey) return null;
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("countryCode", url.searchParams.get("countryCode") || "US");
    url.searchParams.set("size", String(pageSize));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", url.searchParams.get("sort") || "date,asc");
    url.searchParams.set("startDateTime", url.searchParams.get("startDateTime") || now.toISOString().replace(/\.\d{3}Z$/, "Z"));
    return url.toString();
  }

  if (provider === "nyc_parks" && isNycOpenDataResource(url, ARCHIVED_NYC_PARKS_DATASET_ID)) return null;

  url.searchParams.set("$limit", String(pageSize));
  url.searchParams.set("$offset", String(page * pageSize));

  if (isNycOpenDataResource(url, NYC_PERMITTED_EVENTS_DATASET_ID)) {
    const currentTimestamp = now.toISOString().replace(/Z$/, "");
    const clauses = [`end_date_time >= '${currentTimestamp}'`];
    if (provider === "nyc_parks") clauses.push("event_agency = 'Parks Department'");
    const where = combineWhere(url.searchParams.get("$where"), clauses);
    if (where) url.searchParams.set("$where", where);
    if (!url.searchParams.get("$order")) url.searchParams.set("$order", "start_date_time ASC");
  }

  return url.toString();
}

export function extractEventProviderRows(provider: Provider, payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;

  if (provider === "ticketmaster") {
    const embedded = record._embedded;
    if (embedded && typeof embedded === "object") {
      const events = (embedded as Record<string, unknown>).events;
      return Array.isArray(events) ? events : [];
    }
  }

  for (const key of ["results", "events", "data", "items"]) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
}

export function normalizeEventLifecycle(event: NormalizedEvent, now: Date): CanonicalEventInput {
  if (event.status === "cancelled") return { ...event, searchable: false };
  const terminalAt = event.endsAt || event.startsAt;
  const terminalTime = Date.parse(terminalAt);
  if (Number.isFinite(terminalTime) && terminalTime < now.getTime()) {
    return { ...event, status: "completed", searchable: false };
  }
  return event;
}

export function nycOperationalNoiseEventIds({
  events,
  sources,
}: {
  events: Array<{ id: string; title: string; category: string | null; searchable?: boolean }>;
  sources: Array<{ event_id: string; provider: string }>;
}) {
  const providersByEvent = new Map<string, Set<string>>();
  for (const source of sources) {
    const providers = providersByEvent.get(source.event_id) ?? new Set<string>();
    providers.add(source.provider);
    providersByEvent.set(source.event_id, providers);
  }

  return events
    .filter((event) => {
      if (event.searchable === false) return false;
      const providers = providersByEvent.get(event.id);
      if (!providers || ![...providers].some((provider) => NYC_EVENT_PROVIDERS.has(provider))) return false;
      if ([...providers].some((provider) => !NYC_EVENT_PROVIDERS.has(provider))) return false;
      return !classifyNycConsumerEventEligibility({ title: event.title, eventType: event.category }).searchable;
    })
    .map((event) => event.id);
}

async function fetchPage(fetchImpl: typeof fetch, url: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetchImpl(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Provider request failed with HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function expireStaleProviderEvents(supabase: SupabaseClient, now: Date) {
  const nowIso = now.toISOString();
  const terminalIds = new Set<string>();

  const ended = await supabase
    .from("events")
    .select("id")
    .eq("source_kind", "provider")
    .in("status", ["scheduled", "postponed"])
    .lt("ends_at", nowIso)
    .limit(EXPIRE_SWEEP_LIMIT);
  if (ended.error) throw ended.error;
  for (const row of ended.data || []) terminalIds.add(String(row.id));

  const startedWithoutEnd = await supabase
    .from("events")
    .select("id")
    .eq("source_kind", "provider")
    .in("status", ["scheduled", "postponed"])
    .is("ends_at", null)
    .lt("starts_at", nowIso)
    .limit(EXPIRE_SWEEP_LIMIT);
  if (startedWithoutEnd.error) throw startedWithoutEnd.error;
  for (const row of startedWithoutEnd.data || []) terminalIds.add(String(row.id));

  if (terminalIds.size === 0) return 0;
  const { error } = await supabase
    .from("events")
    .update({ status: "completed", searchable: false, updated_at: nowIso })
    .in("id", [...terminalIds]);
  if (error) throw error;
  return terminalIds.size;
}

async function reconcileNycOperationalNoise(supabase: SupabaseClient, now: Date) {
  const sourceResult = await supabase
    .from("event_sources")
    .select("event_id,provider")
    .in("provider", ["nyc_events", "nyc_parks"])
    .limit(QUALITY_SWEEP_LIMIT);
  if (sourceResult.error) throw sourceResult.error;

  const candidateIds = [...new Set((sourceResult.data || []).map((row) => String(row.event_id)))];
  if (candidateIds.length === 0) return 0;

  const [eventResult, allSourceResult] = await Promise.all([
    supabase
      .from("events")
      .select("id,title,category,searchable")
      .eq("source_kind", "provider")
      .eq("searchable", true)
      .in("id", candidateIds)
      .limit(QUALITY_SWEEP_LIMIT),
    supabase
      .from("event_sources")
      .select("event_id,provider")
      .in("event_id", candidateIds),
  ]);
  if (eventResult.error) throw eventResult.error;
  if (allSourceResult.error) throw allSourceResult.error;

  const suppressIds = nycOperationalNoiseEventIds({
    events: (eventResult.data || []).map((row) => ({
      id: String(row.id),
      title: String(row.title ?? ""),
      category: row.category == null ? null : String(row.category),
      searchable: Boolean(row.searchable),
    })),
    sources: (allSourceResult.data || []).map((row) => ({
      event_id: String(row.event_id),
      provider: String(row.provider),
    })),
  });

  if (suppressIds.length === 0) return 0;
  const { error } = await supabase
    .from("events")
    .update({ searchable: false, updated_at: now.toISOString() })
    .in("id", suppressIds);
  if (error) throw error;
  return suppressIds.length;
}

export async function ingestEventProvider(
  provider: Provider,
  options: EventIngestionOptions = {},
): Promise<EventProviderImportResult> {
  const now = options.now || new Date();
  const pageSize = clampInteger(options.pageSize, DEFAULT_PAGE_SIZE, 1, HARD_MAX_PAGE_SIZE);
  const maxPages = clampInteger(options.maxPages, DEFAULT_MAX_PAGES, 1, HARD_MAX_PAGES);
  const config = providerConfig(provider, pageSize, maxPages);
  const counts = emptyCounts();
  const supabase = options.supabase || supabaseAdmin;
  const fetchImpl = options.fetchImpl || fetch;

  const configurationError = nycProviderConfigurationError(provider, config.url);
  const firstUrl = buildEventProviderPageUrl(provider, 0, pageSize, now);
  if (!firstUrl) {
    return {
      provider,
      configured: Boolean(config.url),
      success: false,
      pages: 0,
      counts: { ...counts, skipped: 1 },
      error: configurationError || (provider === "ticketmaster"
        ? "TICKETMASTER_API_KEY is not configured."
        : `${provider === "nyc_events" ? "NYC_EVENTS_API_URL" : "NYC_PARKS_EVENTS_API_URL"} is not configured.`),
    };
  }

  let pages = 0;
  try {
    for (let page = 0; page < config.maxPages; page += 1) {
      const url = buildEventProviderPageUrl(provider, page, pageSize, now);
      if (!url) break;
      const payload = await fetchPage(fetchImpl, url);
      pages += 1;
      const rows = extractEventProviderRows(provider, payload);
      counts.fetched += rows.length;
      if (rows.length === 0) break;

      const normalized = normalizeProviderEvents(provider, rows);
      counts.normalized += normalized.events.length;
      counts.skipped += normalized.rejected.length;

      for (const event of normalized.events) {
        try {
          const result = await upsertCanonicalEvent(supabase, normalizeEventLifecycle(event, now));
          switch (result.action) {
            case "inserted":
              counts.inserted += 1;
              break;
            case "updated":
              counts.updated += 1;
              break;
            case "deduped":
              counts.deduped += 1;
              break;
          }
        } catch {
          counts.failed += 1;
        }
      }

      if (rows.length < config.pageSize) break;
    }

    return { provider, configured: true, success: counts.failed === 0, pages, counts };
  } catch (error) {
    counts.failed += 1;
    return { provider, configured: true, success: false, pages, counts, error: errorMessage(error) };
  }
}

export async function runEventProviderIngestion(options: EventIngestionOptions = {}) {
  const providers = options.providers || (["ticketmaster", "nyc_events", "nyc_parks"] as Provider[]);
  const results: EventProviderImportResult[] = [];
  const supabase = options.supabase || supabaseAdmin;
  const now = options.now || new Date();

  // Providers are intentionally isolated so one upstream outage never blocks the others.
  for (const provider of providers) {
    results.push(await ingestEventProvider(provider, { ...options, supabase, now }));
  }

  const counts = results.reduce<EventImportCounts>((total, result) => {
    for (const key of Object.keys(total) as Array<keyof EventImportCounts>) total[key] += result.counts[key];
    return total;
  }, emptyCounts());

  let expired = 0;
  let lifecycleError: string | null = null;
  try {
    expired = await expireStaleProviderEvents(supabase, now);
    counts.updated += expired;
  } catch (error) {
    counts.failed += 1;
    lifecycleError = errorMessage(error);
  }

  let qualitySuppressed = 0;
  let qualityError: string | null = null;
  try {
    qualitySuppressed = await reconcileNycOperationalNoise(supabase, now);
    counts.updated += qualitySuppressed;
  } catch (error) {
    counts.failed += 1;
    qualityError = errorMessage(error);
  }

  return {
    success: results.every((result) => result.success || !result.configured) && !lifecycleError && !qualityError,
    counts,
    expired,
    qualitySuppressed,
    lifecycleError,
    qualityError,
    providers: results,
    startedProviders: results.filter((result) => result.configured && result.pages > 0).length,
    configuredProviders: results.filter((result) => result.configured).map((result) => result.provider),
  };
}
