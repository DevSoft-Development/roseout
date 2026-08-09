import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizeProviderEvents } from "./providers";
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

function buildPageUrl(config: ProviderConfig, page: number, now: Date) {
  if (!config.url) return null;
  const url = new URL(config.url);

  if (config.provider === "ticketmaster") {
    const apiKey = process.env.TICKETMASTER_API_KEY?.trim();
    if (!apiKey) return null;
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set("countryCode", url.searchParams.get("countryCode") || "US");
    url.searchParams.set("size", String(config.pageSize));
    url.searchParams.set("page", String(page));
    url.searchParams.set("sort", url.searchParams.get("sort") || "date,asc");
    url.searchParams.set("startDateTime", url.searchParams.get("startDateTime") || now.toISOString().replace(/\.\d{3}Z$/, "Z"));
    return url.toString();
  }

  url.searchParams.set("$limit", String(config.pageSize));
  url.searchParams.set("$offset", String(page * config.pageSize));
  return url.toString();
}

function extractRows(provider: Provider, payload: unknown): unknown[] {
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

function normalizeLifecycle(event: NormalizedEvent, now: Date): CanonicalEventInput {
  if (event.status === "cancelled") return { ...event, searchable: false };
  const terminalAt = event.endsAt || event.startsAt;
  const terminalTime = Date.parse(terminalAt);
  if (Number.isFinite(terminalTime) && terminalTime < now.getTime()) {
    return { ...event, status: "completed", searchable: false };
  }
  return event;
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

  const firstUrl = buildPageUrl(config, 0, now);
  if (!firstUrl) {
    return {
      provider,
      configured: false,
      success: false,
      pages: 0,
      counts: { ...counts, skipped: 1 },
      error: provider === "ticketmaster"
        ? "TICKETMASTER_API_KEY is not configured."
        : `${provider === "nyc_events" ? "NYC_EVENTS_API_URL" : "NYC_PARKS_EVENTS_API_URL"} is not configured.`,
    };
  }

  let pages = 0;
  try {
    for (let page = 0; page < config.maxPages; page += 1) {
      const url = buildPageUrl(config, page, now);
      if (!url) break;
      const payload = await fetchPage(fetchImpl, url);
      pages += 1;
      const rows = extractRows(provider, payload);
      counts.fetched += rows.length;
      if (rows.length === 0) break;

      const normalized = normalizeProviderEvents(provider, rows);
      counts.normalized += normalized.events.length;
      counts.skipped += normalized.rejected.length;

      for (const event of normalized.events) {
        try {
          const result = await upsertCanonicalEvent(supabase, normalizeLifecycle(event, now));
          counts[result.action] += 1;
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

  // Providers are intentionally isolated so one upstream outage never blocks the others.
  for (const provider of providers) {
    results.push(await ingestEventProvider(provider, options));
  }

  const counts = results.reduce<EventImportCounts>((total, result) => {
    for (const key of Object.keys(total) as Array<keyof EventImportCounts>) total[key] += result.counts[key];
    return total;
  }, emptyCounts());

  return {
    success: results.every((result) => result.success || !result.configured),
    counts,
    providers: results,
    startedProviders: results.filter((result) => result.configured).length,
    configuredProviders: results.filter((result) => result.configured).map((result) => result.provider),
  };
}
