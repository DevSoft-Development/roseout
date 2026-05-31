"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

type TabId = "google" | "growth" | "history" | "duplicates" | "qr";

type ImportSectionMeta = {
  imported?: unknown;
  skipped?: unknown;
  failed?: unknown;
  total_found_from_google?: unknown;
  queries_used?: string[];
};

type ImportMeta = ImportSectionMeta & {
  type?: string;
  checked?: unknown;
  settings?: {
    type?: string;
    minRating?: number;
    primaryTag?: string;
    batch?: string;
    maxQueries?: number;
  };
  restaurant?: ImportSectionMeta;
  activity?: ImportSectionMeta;
  queries_used?: string[];
};

type ImportLog = {
  id: string;
  job_name: string;
  run_date: string;
  created_at?: string;
  meta: ImportMeta | null;
  error: string | null;
};

type LatestBatch = {
  id: string;
  source?: string | null;
  source_label?: string | null;
  status?: string | null;
  total_seen?: number | null;
  total_staged?: number | null;
  total_duplicates?: number | null;
  total_possible_duplicates?: number | null;
  total_rejected?: number | null;
  total_publish_ready?: number | null;
  total_published?: number | null;
  metadata?: {
    mapped?: unknown;
    duplicatesRemoved?: unknown;
    limit?: unknown;
    offset?: unknown;
    nextOffset?: unknown;
    filterIndex?: unknown;
    categoryGroup?: unknown;
  } | null;
  started_at?: string | null;
  completed_at?: string | null;
};

type GrowthSummary = {
  liveLocations?: number | null;
  searchableLocations?: number | null;
  needsReview?: number | null;
  duplicates?: number | null;
  staged?: number | null;
  publishReady?: number | null;
  possibleDuplicates?: number | null;
  rejected?: number | null;
  enrichmentQueued?: number | null;
  remainingPublishReady?: number | null;
  remainingUncheckedDedupe?: number | null;
  missingClaimCodes?: number | null;
  missingClaimQrs?: number | null;
  missingPublicQrs?: number | null;
  siteUrlConfigured?: boolean;
  siteUrl?: string | null;
  latestBatches?: LatestBatch[];
};

type ActionResult = Record<string, unknown> & {
  success?: boolean;
  error?: string;
  batchId?: string;
};

type DuplicateMatch = {
  id: string;
  stagingId: string;
  existingLocationId: string;
  stagedName?: string | null;
  stagedAddress?: string | null;
  existingName?: string | null;
  existingAddress?: string | null;
  duplicateScore?: number | null;
  matchReasons?: string[] | null;
  decision?: string | null;
};

async function parseActionResponse(response: Response) {
  const responseText = await response.text();

  let data: ActionResult = {};
  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    data = {
      success: false,
      error: responseText || `Request failed with status ${response.status}`,
    };
  }

  if (!response.ok || data.success === false) {
    throw new Error(
      data.error ||
        (typeof data.message === "string" ? data.message : undefined) ||
        `Request failed with status ${response.status}`,
    );
  }

  return data;
}

type StagedRecord = {
  id: string;
  source?: string | null;
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  primary_category?: string | null;
  quality_score?: number | null;
  quality_status?: string | null;
  duplicate_status?: string | null;
  import_status?: string | null;
  matched_location_id?: string | null;
  rejection_reason?: string | null;
};

function getNumber(value: unknown) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function getImported(meta: ImportMeta) {
  if (meta?.imported !== undefined && meta?.imported !== null) {
    return getNumber(meta.imported);
  }

  return (
    getNumber(meta?.restaurant?.imported) + getNumber(meta?.activity?.imported)
  );
}

function getSkipped(meta: ImportMeta) {
  if (meta?.skipped !== undefined && meta?.skipped !== null) {
    return getNumber(meta.skipped);
  }

  return (
    getNumber(meta?.restaurant?.skipped) + getNumber(meta?.activity?.skipped)
  );
}

function getFailed(meta: ImportMeta) {
  if (meta?.failed !== undefined && meta?.failed !== null) {
    return getNumber(meta.failed);
  }

  return (
    getNumber(meta?.restaurant?.failed) + getNumber(meta?.activity?.failed)
  );
}

function getFound(meta: ImportMeta) {
  return getNumber(
    meta?.total_found_from_google ??
      getNumber(meta?.restaurant?.total_found_from_google) +
        getNumber(meta?.activity?.total_found_from_google),
  );
}

const importTypeOptions = [
  { label: "All", value: "both" },
  { label: "Restaurant", value: "restaurants" },
  { label: "Activity", value: "activities" },
];

const areaOptions = [
  { label: "NYC", value: "nyc" },
  { label: "Connecticut", value: "ct" },
  { label: "New Jersey", value: "nj" },
  { label: "Long Island", value: "long_island" },
];

const primaryTagOptions = [
  { label: "Best mix", value: "all" },
  { label: "Birthday", value: "birthday" },
  { label: "Brunch", value: "brunch" },
  { label: "Rooftop", value: "rooftop" },
  { label: "Nightlife", value: "nightlife" },
  { label: "Romantic", value: "romantic" },
  { label: "Fun", value: "fun" },
  { label: "Luxury", value: "luxury" },
  { label: "Seafood", value: "seafood" },
  { label: "Steakhouse", value: "steakhouse" },
  { label: "Italian", value: "italian" },
  { label: "Soul Food", value: "soul_food" },
  { label: "Hookah", value: "hookah" },
  { label: "Karaoke", value: "karaoke" },
  { label: "Bowling", value: "bowling" },
  { label: "Comedy", value: "comedy" },
];

const ratingOptions = [
  { label: "4.0+ stars", value: "4" },
  { label: "4.2+ stars", value: "4.2" },
  { label: "4.5+ stars", value: "4.5" },
  { label: "3.8+ stars", value: "3.8" },
];

const NYC_OFFSET_STORAGE_KEY = "theouthaven_nyc_import_offset";
const DEFAULT_OSM_CATEGORY_GROUP = "nightlife";

function getOsmCursorKey(group: string) {
  return `theouthaven_osm_import_cursor_${group || "all"}`;
}

function getLegacyOsmOffsetKey(group: string) {
  return `theouthaven_osm_import_offset_${group || "all"}`;
}

function readSavedOsmCursor(group: string) {
  const cursorText = window.localStorage.getItem(getOsmCursorKey(group));
  if (cursorText) {
    try {
      const cursor = JSON.parse(cursorText) as {
        filterIndex?: unknown;
        offset?: unknown;
      };
      return {
        filterIndex: String(Number(cursor.filterIndex) || 0),
        offset: String(Number(cursor.offset) || 0),
      };
    } catch {
      window.localStorage.removeItem(getOsmCursorKey(group));
    }
  }

  const legacyOffset = window.localStorage.getItem(
    getLegacyOsmOffsetKey(group),
  );
  return { filterIndex: "0", offset: legacyOffset || "0" };
}

function saveOsmCursor(group: string, filterIndex: string, offset: string) {
  window.localStorage.setItem(
    getOsmCursorKey(group),
    JSON.stringify({
      filterIndex: Number(filterIndex) || 0,
      offset: Number(offset) || 0,
    }),
  );
  window.localStorage.setItem(getLegacyOsmOffsetKey(group), offset);
}

const queryCountOptions = [
  { label: "1 query", value: "1" },
  { label: "2 queries", value: "2" },
  { label: "3 queries", value: "3" },
  { label: "5 queries", value: "5" },
  { label: "8 queries", value: "8" },
  { label: "12 queries", value: "12" },
];

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "google", label: "Google Import" },
  { id: "growth", label: "Location Growth" },
  { id: "history", label: "Import History" },
  { id: "duplicates", label: "Duplicate Review" },
  { id: "qr", label: "QR Tools" },
];

export default function ImportPage() {
  const [activeTab, setActiveTab] = useState<TabId>("google");
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [summary, setSummary] = useState<GrowthSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [stagedRecords, setStagedRecords] = useState<StagedRecord[]>([]);
  const [duplicates, setDuplicates] = useState<DuplicateMatch[]>([]);
  const [duplicateBatchId, setDuplicateBatchId] = useState("");
  const [stagingBatchId, setStagingBatchId] = useState("");
  const [importType, setImportType] = useState("both");
  const [area, setArea] = useState("nyc");
  const [primaryTag, setPrimaryTag] = useState("all");
  const [minRating, setMinRating] = useState("4");
  const [queryCount, setQueryCount] = useState("2");
  const [googleMode, setGoogleMode] = useState("direct");
  const [nycLimit, setNycLimit] = useState("500");
  const [nycOffset, setNycOffset] = useState("0");
  const [osmLimit, setOsmLimit] = useState("50");
  const [osmOffset, setOsmOffset] = useState("0");
  const [osmFilterIndex, setOsmFilterIndex] = useState("0");
  const [osmCategoryGroup, setOsmCategoryGroup] = useState(
    DEFAULT_OSM_CATEGORY_GROUP,
  );
  const [osmDebugTagKey, setOsmDebugTagKey] = useState("amenity");
  const [osmDebugTagValue, setOsmDebugTagValue] = useState("bar");
  const [osmDebugBbox, setOsmDebugBbox] = useState("nyc");
  const [dedupeBatchId, setDedupeBatchId] = useState("");
  const [publishBatchId, setPublishBatchId] = useState("");
  const [dedupeScope, setDedupeScope] = useState("all");
  const [publishScope, setPublishScope] = useState("all");
  const [publishLimit, setPublishLimit] = useState("500");
  const [dedupeLimit, setDedupeLimit] = useState("250");
  const [enrichLimit, setEnrichLimit] = useState("50");
  const [qrLimit, setQrLimit] = useState("100");
  const [cleanupOffset, setCleanupOffset] = useState("0");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    document.title = "Import Center | TheOutHaven Admin";
  }, []);

  useEffect(() => {
    const savedNycOffset = window.localStorage.getItem(NYC_OFFSET_STORAGE_KEY);
    if (savedNycOffset !== null) {
      // Persisted pagination should restore the previous NYC import cursor.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNycOffset(savedNycOffset);
    }

    const savedOsmCursor = readSavedOsmCursor(DEFAULT_OSM_CATEGORY_GROUP);
    // Persisted app-managed OSM pagination should restore the previous cursor
    // for the default category group.
    setOsmFilterIndex(savedOsmCursor.filterIndex);
    setOsmOffset(savedOsmCursor.offset);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(NYC_OFFSET_STORAGE_KEY, nycOffset);
  }, [nycOffset]);

  const fetchLogs = useCallback(async () => {
    try {
      setLogsLoading(true);
      const res = await fetch("/api/admin/import-logs", { cache: "no-store" });
      const data = await res.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error("Failed to fetch import logs:", error);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      setSummaryLoading(true);
      const res = await fetch("/api/admin/location-growth/summary", {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Summary failed");
      setSummary(data);
    } catch (error) {
      console.error("Failed to fetch location growth summary:", error);
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial data load is intentionally kicked off once the import center mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    fetchSummary();
  }, [fetchLogs, fetchSummary]);

  useEffect(() => {
    if (runningAction !== "google") {
      // Progress is visual-only and should reset as soon as Google import stops.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(0);
      return;
    }

    setProgress(15);
    const timer = window.setInterval(() => {
      setProgress((previous) => (previous >= 92 ? previous : previous + 5));
    }, 700);

    return () => window.clearInterval(timer);
  }, [runningAction]);

  const totals = useMemo(() => {
    return logs.reduce(
      (acc, log) => {
        const meta = log.meta || {};
        acc.imported += getImported(meta);
        acc.skipped += getSkipped(meta);
        acc.failed += getFailed(meta);
        acc.found += getFound(meta);
        if (log.error) acc.errors += 1;
        return acc;
      },
      { imported: 0, skipped: 0, failed: 0, found: 0, errors: 0 },
    );
  }, [logs]);

  const lastLog = logs[0];

  const postAction = async (
    key: string,
    url: string,
    body: Record<string, unknown>,
    options?: { confirm?: string },
  ) => {
    if (options?.confirm && !window.confirm(options.confirm)) return null;

    try {
      setRunningAction(key);
      setActionResult(null);
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await parseActionResponse(res);
      setActionResult(data);
      if (data.batchId) {
        setDedupeBatchId(String(data.batchId));
        setPublishBatchId(String(data.batchId));
        setDuplicateBatchId(String(data.batchId));
      }
      await Promise.all([fetchSummary(), fetchLogs()]);
      return data;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setActionResult({
        success: false,
        error: message,
        ...(key === "osm" ? { categoryGroup: osmCategoryGroup } : {}),
      });
      return null;
    } finally {
      setRunningAction(null);
    }
  };

  const handleRunGoogleImport = async () => {
    if (googleMode === "staged") {
      setActionResult({
        success: false,
        error:
          "Safer staged Google import is ready for the import center UI, but the existing Google staging route is not available yet. Use direct mode for the current Google importer or bulk-growth staged sources for NYC/OSM.",
      });
      return;
    }

    const result = await postAction("google", "/api/admin/run-google-import", {
      type: importType,
      limit: 2,
      batch: primaryTag,
      primaryTag,
      areas: area,
      minRating: Number(minRating),
      requirePhoto: true,
      requirePhone: true,
      requireWebsite: true,
      requireLocation: true,
      requireCuisineType: true,
      maxQueries: Number(queryCount),
    });

    if (result?.success !== false) setProgress(100);
  };

  const loadStagedRecords = async (batchId: string) => {
    if (!batchId) {
      setActionResult({ success: false, error: "Enter a batch ID first." });
      return;
    }

    try {
      setRunningAction("staging");
      const params = new URLSearchParams({ batchId, limit: "25" });
      const res = await fetch(
        `/api/admin/location-growth/staging?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load staging rows");
      setStagedRecords(data.records || []);
      setStagingBatchId(batchId);
      setActiveTab("history");
    } catch (error) {
      setActionResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunningAction(null);
    }
  };

  const loadDuplicates = async (batchId = duplicateBatchId) => {
    try {
      setRunningAction("duplicates");
      const params = new URLSearchParams({ limit: "25" });
      if (batchId) params.set("batchId", batchId);
      const res = await fetch(
        `/api/admin/location-growth/duplicates?${params.toString()}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load duplicates");
      setDuplicates(data.matches || []);
      setDuplicateBatchId(batchId);
      setActiveTab("duplicates");
    } catch (error) {
      setActionResult({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setRunningAction(null);
    }
  };

  const decideDuplicate = async (
    match: DuplicateMatch,
    decision: "duplicate" | "unique" | "reject",
  ) => {
    await postAction(
      "duplicate-decision",
      "/api/admin/location-growth/duplicates/decision",
      {
        stagingId: match.stagingId,
        existingLocationId: match.existingLocationId,
        decision,
      },
    );
    await loadDuplicates(duplicateBatchId);
  };

  const getSafeNycLimit = () => {
    const limit = Number(nycLimit);
    if (!Number.isFinite(limit)) return 500;
    return Math.min(Math.max(Math.trunc(limit), 1), 1000);
  };

  const getSafeNycOffset = () => {
    const offset = Number(nycOffset);
    if (!Number.isFinite(offset)) return 0;
    return Math.max(Math.trunc(offset), 0);
  };

  const runNycImport = async () => {
    const limit = getSafeNycLimit();
    const offset = getSafeNycOffset();
    const data = await postAction(
      "nyc",
      "/api/admin/location-growth/import-nyc-restaurants",
      {
        limit,
        offset,
      },
    );

    if (data && data.success !== false) {
      const nextOffset =
        data?.nextOffset !== undefined && data.nextOffset !== null
          ? Number(data.nextOffset)
          : offset + limit;
      if (Number.isFinite(nextOffset)) {
        setNycOffset(String(nextOffset));
      }
    }
  };

  const getSafeOsmLimit = () => {
    const limit = Number(osmLimit || 50);
    if (!Number.isFinite(limit)) return 50;
    return Math.min(Math.max(Math.trunc(limit), 1), 250);
  };

  const getSafeOsmOffset = () => {
    const offset = Number(osmOffset || 0);
    if (!Number.isFinite(offset)) return 0;
    return Math.max(Math.trunc(offset), 0);
  };

  const runOsmImport = async () => {
    const limit = getSafeOsmLimit();
    const offset = getSafeOsmOffset();
    const data = await postAction(
      "osm",
      "/api/admin/location-growth/import-osm-activities",
      {
        limit,
        offset,
        filterIndex: Number(osmFilterIndex) || 0,
        categoryGroup: osmCategoryGroup || "nightlife",
      },
    );

    if (data && data.success !== false) {
      const cursor = data.nextCursor as
        | { filterIndex?: unknown; offset?: unknown }
        | null
        | undefined;
      const nextFilterIndex =
        cursor?.filterIndex !== undefined
          ? Number(cursor.filterIndex)
          : data.filterIndex !== undefined
            ? Number(data.filterIndex)
            : Number(osmFilterIndex) || 0;
      const nextOffset =
        cursor?.offset !== undefined
          ? Number(cursor.offset)
          : data.offset !== undefined
            ? Number(data.offset)
            : data.hasMore === false
              ? 0
              : offset + limit;
      if (Number.isFinite(nextFilterIndex))
        setOsmFilterIndex(String(nextFilterIndex));
      if (Number.isFinite(nextOffset)) setOsmOffset(String(nextOffset));
      if (Number.isFinite(nextFilterIndex) && Number.isFinite(nextOffset)) {
        saveOsmCursor(
          osmCategoryGroup,
          String(nextFilterIndex),
          String(nextOffset),
        );
      }
    }
  };

  const handleOsmCategoryGroupChange = (nextGroup: string) => {
    setOsmCategoryGroup(nextGroup);
    const saved = readSavedOsmCursor(nextGroup);
    setOsmOffset(saved.offset);
    setOsmFilterIndex(saved.filterIndex);
  };

  const resetOsmOffset = () => {
    const confirmed = window.confirm(
      `Reset OSM cursor for ${osmCategoryGroup} to filter 0 / offset 0?`,
    );
    if (!confirmed) return;
    saveOsmCursor(osmCategoryGroup, "0", "0");
    setOsmOffset("0");
    setOsmFilterIndex("0");
  };

  const resetAllOsmCursors = () => {
    const confirmed = window.confirm(
      "Reset all OSM cursors to filter 0 / offset 0?",
    );
    if (!confirmed) return;
    ["nightlife", "culture", "activities", "dessert", "all"].forEach(
      (group) => {
        saveOsmCursor(group, "0", "0");
      },
    );
    setOsmOffset("0");
    setOsmFilterIndex("0");
  };

  const testOsmQuery = () =>
    postAction("osm-test", "/api/admin/location-growth/test-osm", {
      tagKey: osmDebugTagKey || "amenity",
      tagValue: osmDebugTagValue || "bar",
      bbox: osmDebugBbox || "nyc",
    });

  const runCleanupBatch = async () => {
    const data = await postAction("cleanup", "/api/admin/cleanup-locations", {
      table: "locations",
      limit: 500,
      offset: Number(cleanupOffset) || 0,
    });
    if (data?.nextOffset !== undefined && data.nextOffset !== null) {
      setCleanupOffset(String(data.nextOffset));
    }
  };

  return (
    <main className="min-h-screen bg-[#090506] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/40">
          <div className="relative p-6 sm:p-8">
            <div className="absolute right-0 top-0 h-44 w-44 rounded-full bg-rose-600/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-44 w-44 rounded-full bg-red-900/20 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-rose-300">
                  TheOutHaven Admin
                </p>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Import Center
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                  Manage Google imports, staged location growth, dedupe,
                  enrichment, and QR tools from one safe admin workspace.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  fetchLogs();
                  fetchSummary();
                }}
                disabled={logsLoading || summaryLoading}
                className="rounded-full border border-white/10 px-5 py-3 text-sm font-black text-zinc-200 transition hover:border-rose-300 hover:bg-white/10 disabled:opacity-50"
              >
                {logsLoading || summaryLoading
                  ? "Refreshing..."
                  : "Refresh Data"}
              </button>
            </div>
          </div>
        </header>

        <nav className="mb-6 overflow-x-auto rounded-3xl border border-white/10 bg-black/30 p-2">
          <div className="flex min-w-max gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                  activeTab === tab.id
                    ? "bg-rose-600 text-white shadow-lg shadow-rose-950/40"
                    : "text-zinc-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </nav>

        {actionResult ? (
          <ResultBanner
            result={actionResult}
            onRunDedupe={(batchId) => {
              setDedupeScope("batch");
              setDedupeBatchId(batchId);
              postAction("dedupe", "/api/admin/location-growth/dedupe", {
                batchId,
                mode: "staging",
              });
            }}
            onPublishBatch={(batchId) => {
              setPublishScope("batch");
              setPublishBatchId(batchId);
              setActiveTab("growth");
            }}
          />
        ) : null}

        {activeTab === "google" ? (
          <GoogleImportPanel
            importType={importType}
            setImportType={setImportType}
            area={area}
            setArea={setArea}
            primaryTag={primaryTag}
            setPrimaryTag={setPrimaryTag}
            minRating={minRating}
            setMinRating={setMinRating}
            queryCount={queryCount}
            setQueryCount={setQueryCount}
            googleMode={googleMode}
            setGoogleMode={setGoogleMode}
            running={runningAction === "google"}
            progress={progress}
            onRun={handleRunGoogleImport}
            totals={totals}
            logs={logs}
            lastLog={lastLog}
            loading={logsLoading}
            onBackfillPhones={() =>
              postAction("phones", "/api/admin/backfill-review-counts", {
                fields: ["phone"],
                limit: 50,
                minRating: 0,
                minReviews: 0,
              })
            }
            onBackfillCuisine={() =>
              postAction("cuisine", "/api/admin/restaurants/backfill-cuisine", {
                includeGeneric: true,
                limit: 250,
              })
            }
            onLegacyCleanup={() =>
              postAction(
                "legacy-cleanup",
                "/api/admin/locations/cleanup-missing-address",
                {
                  limit: 100,
                },
              )
            }
            runningAction={runningAction}
          />
        ) : null}

        {activeTab === "growth" ? (
          <LocationGrowthPanel
            summary={summary}
            loading={summaryLoading}
            runningAction={runningAction}
            nycLimit={nycLimit}
            setNycLimit={setNycLimit}
            nycOffset={nycOffset}
            setNycOffset={setNycOffset}
            osmLimit={osmLimit}
            setOsmLimit={setOsmLimit}
            osmOffset={osmOffset}
            setOsmOffset={setOsmOffset}
            osmCategoryGroup={osmCategoryGroup}
            osmFilterIndex={osmFilterIndex}
            setOsmFilterIndex={setOsmFilterIndex}
            setOsmCategoryGroup={handleOsmCategoryGroupChange}
            dedupeScope={dedupeScope}
            setDedupeScope={setDedupeScope}
            dedupeBatchId={dedupeBatchId}
            setDedupeBatchId={setDedupeBatchId}
            publishScope={publishScope}
            setPublishScope={setPublishScope}
            publishBatchId={publishBatchId}
            setPublishBatchId={setPublishBatchId}
            publishLimit={publishLimit}
            dedupeLimit={dedupeLimit}
            setDedupeLimit={setDedupeLimit}
            setPublishLimit={setPublishLimit}
            enrichLimit={enrichLimit}
            setEnrichLimit={setEnrichLimit}
            cleanupOffset={cleanupOffset}
            setCleanupOffset={setCleanupOffset}
            onCleanup={runCleanupBatch}
            onImportNyc={runNycImport}
            onImportNycNext={runNycImport}
            onImportOsm={runOsmImport}
            onImportOsmNext={runOsmImport}
            onResetOsmOffset={resetOsmOffset}
            onResetAllOsmCursors={resetAllOsmCursors}
            osmDebugTagKey={osmDebugTagKey}
            setOsmDebugTagKey={setOsmDebugTagKey}
            osmDebugTagValue={osmDebugTagValue}
            setOsmDebugTagValue={setOsmDebugTagValue}
            osmDebugBbox={osmDebugBbox}
            setOsmDebugBbox={setOsmDebugBbox}
            onTestOsmQuery={testOsmQuery}
            onDedupe={() =>
              postAction("dedupe", "/api/admin/location-growth/dedupe", {
                all: dedupeScope !== "batch",
                batchId:
                  dedupeScope === "batch"
                    ? dedupeBatchId || undefined
                    : undefined,
                limit: Math.min(Math.max(Number(dedupeLimit || 250), 1), 500),
              })
            }
            onPublish={() => {
              const limit = Math.min(
                Math.max(Number(publishLimit || 500), 1),
                1000,
              );
              const publishAll = publishScope !== "batch";
              if (!publishAll && !publishBatchId.trim()) {
                setActionResult({
                  success: false,
                  error: "Select a batch or switch scope to Publish All Ready.",
                });
                return null;
              }
              return postAction(
                "publish",
                "/api/admin/location-growth/publish",
                publishAll
                  ? { all: true, limit }
                  : { batchId: publishBatchId, limit },
                {
                  confirm: publishAll
                    ? `You are about to publish up to ${limit} clean, unique, publish-ready staged records into the live locations table. This will not overwrite CRM fields, claimed location data, or existing QR codes. Continue?`
                    : `You are about to publish up to ${limit} clean, unique records from this batch. Continue?`,
                },
              );
            }}
            onEnrich={() =>
              postAction(
                "enrich",
                "/api/admin/location-growth/enrich-high-value",
                {
                  limit: Number(enrichLimit) || 50,
                },
              )
            }
          />
        ) : null}

        {activeTab === "history" ? (
          <ImportHistoryPanel
            summary={summary}
            loading={summaryLoading}
            stagedRecords={stagedRecords}
            stagingBatchId={stagingBatchId}
            onCopy={(batchId) => navigator.clipboard?.writeText(batchId)}
            onDedupe={(batchId) => {
              setDedupeScope("batch");
              setDedupeBatchId(batchId);
              setActiveTab("growth");
            }}
            onPublish={(batchId) => {
              setPublishScope("batch");
              setPublishBatchId(batchId);
              setActiveTab("growth");
            }}
            onViewStaged={loadStagedRecords}
            onViewDuplicates={(batchId) => loadDuplicates(batchId)}
          />
        ) : null}

        {activeTab === "duplicates" ? (
          <DuplicateReviewPanel
            batchId={duplicateBatchId}
            setBatchId={setDuplicateBatchId}
            matches={duplicates}
            loading={runningAction === "duplicates"}
            onLoad={() => loadDuplicates()}
            onDecision={decideDuplicate}
          />
        ) : null}

        {activeTab === "qr" ? (
          <QrToolsPanel
            summary={summary}
            limit={qrLimit}
            setLimit={setQrLimit}
            running={runningAction === "qr"}
            onGenerate={() =>
              postAction(
                "qr",
                "/api/admin/location-growth/generate-missing-qrs",
                { limit: Number(qrLimit) || 100 },
                {
                  confirm:
                    "Generate missing public and claim QR codes for clean live locations? Existing QR fields will not be replaced.",
                },
              )
            }
          />
        ) : null}
      </div>
    </main>
  );
}

function GoogleImportPanel({
  importType,
  setImportType,
  area,
  setArea,
  primaryTag,
  setPrimaryTag,
  minRating,
  setMinRating,
  queryCount,
  setQueryCount,
  googleMode,
  setGoogleMode,
  running,
  progress,
  onRun,
  totals,
  logs,
  lastLog,
  loading,
  onBackfillPhones,
  onBackfillCuisine,
  onLegacyCleanup,
  runningAction,
}: {
  importType: string;
  setImportType: (value: string) => void;
  area: string;
  setArea: (value: string) => void;
  primaryTag: string;
  setPrimaryTag: (value: string) => void;
  minRating: string;
  setMinRating: (value: string) => void;
  queryCount: string;
  setQueryCount: (value: string) => void;
  googleMode: string;
  setGoogleMode: (value: string) => void;
  running: boolean;
  progress: number;
  onRun: () => void;
  totals: {
    imported: number;
    skipped: number;
    failed: number;
    found: number;
    errors: number;
  };
  logs: ImportLog[];
  lastLog?: ImportLog;
  loading: boolean;
  onBackfillPhones: () => void;
  onBackfillCuisine: () => void;
  onLegacyCleanup: () => void;
  runningAction: string | null;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
              Existing Google Import
            </p>
            <h2 className="mt-2 text-2xl font-black">Google Import</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
              Google imports are best for targeted enrichment and gap-filling.
              Bulk growth should use staged imports first.
            </p>
            <p className="mt-3 max-w-3xl text-xs leading-5 text-zinc-500">
              Safety: direct Google imports must not overwrite claimed business
              data, CRM fields, reservation settings, owner/admin photos, or
              existing QR fields. Generated URLs must use configured site URLs,
              not roseout.com.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onBackfillPhones}
              disabled={Boolean(runningAction)}
              className="rounded-full border border-rose-400/40 px-5 py-3 text-sm font-black text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
            >
              {runningAction === "phones"
                ? "Backfilling..."
                : "Backfill Missing Phones"}
            </button>
            <button
              type="button"
              onClick={onBackfillCuisine}
              disabled={Boolean(runningAction)}
              className="rounded-full border border-rose-400/40 px-5 py-3 text-sm font-black text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
            >
              {runningAction === "cuisine"
                ? "Backfilling..."
                : "Backfill Cuisine Names"}
            </button>
            <button
              type="button"
              onClick={onLegacyCleanup}
              disabled={Boolean(runningAction)}
              className="rounded-full border border-rose-400/40 px-5 py-3 text-sm font-black text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
            >
              {runningAction === "legacy-cleanup"
                ? "Cleaning..."
                : "Clean Missing City/State/Zip"}
            </button>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <SelectField
            label="Import"
            value={importType}
            onChange={setImportType}
            options={importTypeOptions}
          />
          <SelectField
            label="Area"
            value={area}
            onChange={setArea}
            options={areaOptions}
          />
          <SelectField
            label="Primary tag"
            value={primaryTag}
            onChange={setPrimaryTag}
            options={primaryTagOptions}
          />
          <SelectField
            label="Rating"
            value={minRating}
            onChange={setMinRating}
            options={ratingOptions}
          />
          <SelectField
            label="Queries to run"
            value={queryCount}
            onChange={setQueryCount}
            options={queryCountOptions}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <SelectField
            label="Import mode"
            value={googleMode}
            onChange={setGoogleMode}
            options={[
              { label: "Safer staged import, recommended", value: "staged" },
              { label: "Direct import, existing behavior", value: "direct" },
            ]}
          />
          <button
            type="button"
            onClick={onRun}
            disabled={Boolean(runningAction)}
            className="rounded-full bg-rose-600 px-7 py-4 text-sm font-black text-white shadow-xl shadow-rose-950/50 transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
          >
            {running ? "Import Running..." : "Run Google Import"}
          </button>
        </div>

        {googleMode === "direct" ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
            Direct Google imports update live locations. Use staged import for
            bulk growth.
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-300">
          <QualityPill text="1 picture required" />
          <QualityPill text="Phone required" />
          <QualityPill text="Website required" />
          <QualityPill text="Cuisine/activity type required" />
          <QualityPill text="Location required" />
        </div>

        {running ? <ProgressBar progress={progress} /> : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Google imported" value={totals.imported} />
        <StatCard label="Skipped" value={totals.skipped} />
        <StatCard label="Failed" value={totals.failed} />
        <StatCard label="Found" value={totals.found} />
        <StatCard label="Errors" value={totals.errors} />
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <div className="mb-5">
          <h2 className="text-lg font-bold">Recent Google Import Logs</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Latest run: {lastLog?.run_date || "No runs yet"}
          </p>
        </div>
        {loading && logs.length === 0 ? (
          <EmptyState text="Loading import logs..." />
        ) : logs.length === 0 ? (
          <EmptyState text="No Google import history yet." />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {logs.slice(0, 6).map((log) => {
              const meta = log.meta || {};
              return (
                <div
                  key={log.id}
                  className="rounded-2xl border border-white/10 bg-black/30 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">
                        {log.job_name || "Google Import"}
                      </p>
                      <p className="text-sm text-zinc-500">
                        {log.run_date || log.created_at}
                      </p>
                    </div>
                    <StatusPill status={log.error ? "error" : "success"} />
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-4">
                    <MiniStat label="Imported" value={getImported(meta)} />
                    <MiniStat label="Skipped" value={getSkipped(meta)} />
                    <MiniStat label="Failed" value={getFailed(meta)} />
                    <MiniStat label="Found" value={getFound(meta)} />
                  </div>
                  {log.error ? (
                    <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                      {log.error}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <h2 className="text-lg font-bold">CSV Import</h2>
        <p className="mt-2 text-sm text-zinc-400">
          CSV staging import can be added here later. Future CSV uploads should
          create a csv batch, insert rows into location_import_staging, run
          quality scoring and dedupe, then require a publish action before live
          search sees the records.
        </p>
      </section>
    </div>
  );
}

function LocationGrowthPanel(props: {
  summary: GrowthSummary | null;
  loading: boolean;
  runningAction: string | null;
  nycLimit: string;
  setNycLimit: (value: string) => void;
  nycOffset: string;
  setNycOffset: (value: string) => void;
  osmLimit: string;
  setOsmLimit: (value: string) => void;
  osmOffset: string;
  setOsmOffset: (value: string) => void;
  osmCategoryGroup: string;
  osmFilterIndex: string;
  setOsmFilterIndex: (value: string) => void;
  setOsmCategoryGroup: (value: string) => void;
  dedupeScope: string;
  setDedupeScope: (value: string) => void;
  dedupeBatchId: string;
  setDedupeBatchId: (value: string) => void;
  publishScope: string;
  setPublishScope: (value: string) => void;
  publishBatchId: string;
  setPublishBatchId: (value: string) => void;
  publishLimit: string;
  dedupeLimit: string;
  setDedupeLimit: (value: string) => void;
  setPublishLimit: (value: string) => void;
  enrichLimit: string;
  setEnrichLimit: (value: string) => void;
  cleanupOffset: string;
  setCleanupOffset: (value: string) => void;
  onCleanup: () => void;
  onImportNyc: () => void;
  onImportNycNext: () => void;
  onImportOsm: () => void;
  onImportOsmNext: () => void;
  onResetOsmOffset: () => void;
  onResetAllOsmCursors: () => void;
  osmDebugTagKey: string;
  setOsmDebugTagKey: (value: string) => void;
  osmDebugTagValue: string;
  setOsmDebugTagValue: (value: string) => void;
  osmDebugBbox: string;
  setOsmDebugBbox: (value: string) => void;
  onTestOsmQuery: () => void;
  onDedupe: () => void;
  onPublish: () => void;
  onEnrich: () => void;
}) {
  const summaryCards = [
    ["Live", props.summary?.liveLocations],
    ["Searchable", props.summary?.searchableLocations],
    ["Staged", props.summary?.staged],
    ["Publish Ready", props.summary?.publishReady],
    ["Possible Duplicates", props.summary?.possibleDuplicates],
    ["Remaining Dedupe", props.summary?.remainingUncheckedDedupe],
    ["Rejected", props.summary?.rejected],
    ["Enrichment Queued", props.summary?.enrichmentQueued],
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
          Location Growth Pipeline
        </p>
        <h2 className="mt-2 text-2xl font-black">Location Growth Pipeline</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Stage, clean, dedupe, and publish new locations safely without
          disrupting live search or CRM data.
        </p>
        <div className="mt-5 grid grid-flow-col auto-cols-[minmax(150px,1fr)] gap-3 overflow-x-auto pb-2 lg:grid-flow-row lg:grid-cols-7 lg:overflow-visible">
          {summaryCards.map(([label, value]) => (
            <CompactStat
              key={String(label)}
              label={String(label)}
              value={props.loading ? "..." : getNumber(value)}
            />
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <ActionCard
          title="Clean Existing Locations"
          description="Normalize the current live database before importing anything new. This updates quality scores, normalized names, addresses, phones, and search safety fields. It does not delete records or overwrite CRM-managed fields."
          note="Run this before importing new records."
          button="Run Cleanup"
          running={props.runningAction === "cleanup"}
          onClick={props.onCleanup}
        >
          <NumberField
            label="Offset"
            value={props.cleanupOffset}
            onChange={props.setCleanupOffset}
          />
          <ReadOnlyField label="Batch limit" value="500" />
        </ActionCard>

        <ActionCard
          title="Import NYC Open Data Restaurants"
          description="Stage NYC restaurant records from NYC Open Data. Records do not go live until they pass dedupe and quality checks."
          note="Recommended: Start with 100 while testing. Use 500 once imports are working. Max 1000."
          button="Import NYC Batch"
          secondaryButton="Import Next Batch"
          running={props.runningAction === "nyc"}
          onClick={props.onImportNyc}
          onSecondaryClick={props.onImportNycNext}
        >
          <NumberField
            label="Limit"
            value={props.nycLimit}
            onChange={props.setNycLimit}
            min={1}
            max={1000}
          />
          <NumberField
            label="Offset"
            value={props.nycOffset}
            onChange={props.setNycOffset}
          />
        </ActionCard>

        <ActionCard
          title="Import OSM Activities"
          description="Stage date-friendly activities from OpenStreetMap. OSM import uses a cursor (filter index + offset); NYC import uses only an offset."
          note="Start with 50. OSM uses public Overpass servers, so smaller batches are more reliable."
          button="Import OSM Batch"
          secondaryButton="Import Next OSM Batch"
          tertiaryButton="Reset OSM Cursor"
          running={
            props.runningAction === "osm" || props.runningAction === "osm-test"
          }
          onClick={props.onImportOsm}
          onSecondaryClick={props.onImportOsmNext}
          onTertiaryClick={props.onResetOsmOffset}
        >
          <NumberField
            label="Limit"
            value={props.osmLimit}
            onChange={props.setOsmLimit}
            min={1}
            max={250}
          />
          <NumberField
            label="Cursor offset"
            value={props.osmOffset}
            onChange={props.setOsmOffset}
          />
          <NumberField
            label="Cursor filter index"
            value={props.osmFilterIndex}
            onChange={props.setOsmFilterIndex}
            min={0}
          />
          <ReadOnlyField
            label="Current cursor"
            value={`${props.osmCategoryGroup} / filter ${props.osmFilterIndex} / offset ${props.osmOffset}`}
          />
          <details className="sm:col-span-2 rounded-2xl border border-white/10 bg-black/20 p-4">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
              Advanced OSM options
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <SelectField
                label="Category group"
                value={props.osmCategoryGroup}
                onChange={props.setOsmCategoryGroup}
                options={[
                  { label: "Nightlife", value: "nightlife" },
                  { label: "Culture", value: "culture" },
                  { label: "Activities", value: "activities" },
                  { label: "Dessert", value: "dessert" },
                  { label: "All", value: "all" },
                ]}
              />
              <ReadOnlyField label="Region" value="NYC" />
              <button
                type="button"
                onClick={props.onResetAllOsmCursors}
                className="rounded-2xl border border-amber-300/20 px-4 py-3 text-sm font-black text-amber-100 transition hover:border-amber-200 hover:bg-amber-500/10"
              >
                Reset All OSM Cursors
              </button>
            </div>
            <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
              <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
                Test OSM Query
              </summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <TextField
                  label="Tag key"
                  value={props.osmDebugTagKey}
                  onChange={props.setOsmDebugTagKey}
                  placeholder="amenity"
                />
                <TextField
                  label="Tag value"
                  value={props.osmDebugTagValue}
                  onChange={props.setOsmDebugTagValue}
                  placeholder="bar"
                />
                <SelectField
                  label="Bbox"
                  value={props.osmDebugBbox}
                  onChange={props.setOsmDebugBbox}
                  options={[
                    { label: "NYC", value: "nyc" },
                    { label: "NYC Metro", value: "nyc_metro" },
                  ]}
                />
                <button
                  type="button"
                  onClick={props.onTestOsmQuery}
                  disabled={props.runningAction === "osm-test"}
                  className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700"
                >
                  {props.runningAction === "osm-test"
                    ? "Testing..."
                    : "Test OSM"}
                </button>
              </div>
            </details>
          </details>
        </ActionCard>

        <ActionCard
          title="Run Chunked Dedupe"
          description="Dedupe runs in safe chunks to avoid database timeouts. Keep clicking Run Next Dedupe Chunk until remaining unchecked is 0. Dedupe does not use offset."
          button="Run Dedupe Chunk"
          secondaryButton="Run Next Dedupe Chunk"
          running={props.runningAction === "dedupe"}
          onClick={props.onDedupe}
          onSecondaryClick={props.onDedupe}
        >
          <SelectField
            label="Scope"
            value={props.dedupeScope}
            onChange={props.setDedupeScope}
            options={[
              { label: "All staged records", value: "all" },
              { label: "Specific batch", value: "batch" },
            ]}
          />
          <NumberField
            label="Limit"
            value={props.dedupeLimit}
            onChange={props.setDedupeLimit}
            min={1}
            max={500}
          />
          {props.dedupeScope === "batch" ? (
            <TextField
              label="Batch ID"
              value={props.dedupeBatchId}
              onChange={props.setDedupeBatchId}
              placeholder="Paste a batch ID"
            />
          ) : (
            <ReadOnlyField
              label="Batch ID"
              value="Not required for all staged records"
            />
          )}
          <ReadOnlyField
            label="Remaining unchecked"
            value={String(getNumber(props.summary?.remainingUncheckedDedupe))}
          />
        </ActionCard>

        <ActionCard
          title="Publish Ready Records"
          description="Publish clean, unique, high-quality staged records into the existing live locations table. Publish runs a chunk and does not use offset."
          button={
            props.publishScope === "batch"
              ? "Publish Selected Batch Chunk"
              : "Publish All Ready Chunk"
          }
          running={props.runningAction === "publish"}
          onClick={props.onPublish}
        >
          <SelectField
            label="Scope"
            value={props.publishScope}
            onChange={props.setPublishScope}
            options={[
              { label: "All publish-ready staged records", value: "all" },
              { label: "Specific batch", value: "batch" },
            ]}
          />
          <NumberField
            label="Limit"
            value={props.publishLimit}
            onChange={props.setPublishLimit}
            min={1}
            max={500}
          />
          {props.publishScope === "batch" ? (
            <TextField
              label="Batch ID"
              value={props.publishBatchId}
              onChange={props.setPublishBatchId}
              placeholder="Paste a batch ID"
            />
          ) : (
            <ReadOnlyField
              label="Batch ID"
              value="Not required for Publish All"
            />
          )}
          <ReadOnlyField
            label="Remaining ready"
            value={String(
              getNumber(
                props.summary?.remainingPublishReady ??
                  props.summary?.publishReady,
              ),
            )}
          />
        </ActionCard>

        <ActionCard
          title="Enrich High-Value Records"
          description="Only enrich strong searchable locations so Google/API spend is focused on records worth improving. Owner/admin updated fields are filled only when blank."
          button="Enrich High-Value Records"
          running={props.runningAction === "enrich"}
          onClick={props.onEnrich}
        >
          <NumberField
            label="Limit"
            value={props.enrichLimit}
            onChange={props.setEnrichLimit}
          />
        </ActionCard>
      </div>
    </div>
  );
}

function ImportHistoryPanel({
  summary,
  loading,
  stagedRecords,
  stagingBatchId,
  onCopy,
  onDedupe,
  onPublish,
  onViewStaged,
  onViewDuplicates,
}: {
  summary: GrowthSummary | null;
  loading: boolean;
  stagedRecords: StagedRecord[];
  stagingBatchId: string;
  onCopy: (batchId: string) => void;
  onDedupe: (batchId: string) => void;
  onPublish: (batchId: string) => void;
  onViewStaged: (batchId: string) => void;
  onViewDuplicates: (batchId: string) => void;
}) {
  const batches = summary?.latestBatches || [];
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <h2 className="text-lg font-bold">Latest Import Batches</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Staged import health, publishing, and review actions. OSM offset is
          app-managed because Overpass does not provide true offset pagination.
        </p>
        <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs text-zinc-400">
          <summary className="cursor-pointer font-black uppercase tracking-[0.18em] text-zinc-300">
            Emergency SQL to find recent batch IDs
          </summary>
          <pre className="mt-3 overflow-auto whitespace-pre-wrap rounded-xl bg-black/30 p-3 text-zinc-300">{`select
  id,
  source,
  source_label,
  status,
  total_seen,
  total_staged,
  total_publish_ready,
  total_published,
  started_at,
  completed_at
from public.location_import_batches
order by started_at desc
limit 20;`}</pre>
        </details>
        {loading ? <EmptyState text="Loading batches..." /> : null}
        {!loading && batches.length === 0 ? (
          <EmptyState text="No location growth batches yet." />
        ) : null}
        {batches.length ? (
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  {[
                    "Source",
                    "Status",
                    "Seen",
                    "Mapped",
                    "Staged",
                    "Duplicates removed",
                    "Duplicates",
                    "Possible duplicates",
                    "Rejected",
                    "Publish ready",
                    "Published",
                    "Started",
                    "Completed",
                    "Actions",
                  ].map((heading) => (
                    <th
                      key={heading}
                      className="border-b border-white/10 px-3 py-3 font-black"
                    >
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr
                    key={batch.id}
                    className="border-b border-white/5 text-zinc-300"
                  >
                    <td className="px-3 py-4 font-bold text-white">
                      <div>{batch.source_label || batch.source}</div>
                      {batch.metadata ? (
                        <details className="mt-2 text-xs font-normal text-zinc-500">
                          <summary className="cursor-pointer text-zinc-400">
                            Metadata
                          </summary>
                          <div className="mt-1 space-y-1">
                            {batch.metadata.limit !== undefined ? (
                              <div>limit: {String(batch.metadata.limit)}</div>
                            ) : null}
                            {batch.metadata.offset !== undefined ? (
                              <div>offset: {String(batch.metadata.offset)}</div>
                            ) : null}
                            {batch.metadata.nextOffset !== undefined ? (
                              <div>
                                nextOffset: {String(batch.metadata.nextOffset)}
                              </div>
                            ) : null}
                            {batch.metadata.categoryGroup !== undefined ? (
                              <div>
                                categoryGroup:{" "}
                                {String(batch.metadata.categoryGroup)}
                              </div>
                            ) : null}
                          </div>
                        </details>
                      ) : null}
                    </td>
                    <td className="px-3 py-4">
                      <StatusPill status={batch.status || "pending"} />
                    </td>
                    <td className="px-3 py-4">{getNumber(batch.total_seen)}</td>
                    <td className="px-3 py-4">
                      {getNumber(batch.metadata?.mapped)}
                    </td>
                    <td className="px-3 py-4">
                      {getNumber(batch.total_staged)}
                    </td>
                    <td className="px-3 py-4">
                      {getNumber(batch.metadata?.duplicatesRemoved)}
                    </td>
                    <td className="px-3 py-4">
                      {getNumber(batch.total_duplicates)}
                    </td>
                    <td className="px-3 py-4">
                      {getNumber(batch.total_possible_duplicates)}
                    </td>
                    <td className="px-3 py-4">
                      {getNumber(batch.total_rejected)}
                    </td>
                    <td className="px-3 py-4">
                      {getNumber(batch.total_publish_ready)}
                    </td>
                    <td className="px-3 py-4">
                      {getNumber(batch.total_published)}
                    </td>
                    <td className="px-3 py-4">
                      {formatDate(batch.started_at)}
                    </td>
                    <td className="px-3 py-4">
                      {formatDate(batch.completed_at)}
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        <TinyButton onClick={() => onCopy(batch.id)}>
                          Copy batch ID
                        </TinyButton>
                        <TinyButton onClick={() => onDedupe(batch.id)}>
                          Use for Dedupe
                        </TinyButton>
                        <TinyButton onClick={() => onPublish(batch.id)}>
                          Use for Publish
                        </TinyButton>
                        <TinyButton onClick={() => onViewStaged(batch.id)}>
                          View staged
                        </TinyButton>
                        <TinyButton onClick={() => onViewDuplicates(batch.id)}>
                          View duplicates
                        </TinyButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      {stagedRecords.length ? (
        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <h2 className="text-lg font-bold">Staged Records</h2>
          <p className="mt-1 text-sm text-zinc-500">
            Showing latest rows for batch {stagingBatchId}.
          </p>
          <div className="mt-5 overflow-x-auto">
            <table className="min-w-[900px] w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                <tr>
                  {[
                    "Name",
                    "Address",
                    "City",
                    "Category",
                    "Score",
                    "Quality",
                    "Duplicate",
                    "Import",
                    "Reason",
                  ].map((h) => (
                    <th key={h} className="border-b border-white/10 px-3 py-3">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stagedRecords.map((record) => (
                  <tr
                    key={record.id}
                    className="border-b border-white/5 text-zinc-300"
                  >
                    <td className="px-3 py-3 font-bold text-white">
                      {record.name}
                    </td>
                    <td className="px-3 py-3">{record.address}</td>
                    <td className="px-3 py-3">
                      {[record.city, record.state].filter(Boolean).join(", ")}
                    </td>
                    <td className="px-3 py-3">{record.primary_category}</td>
                    <td className="px-3 py-3">
                      {getNumber(record.quality_score)}
                    </td>
                    <td className="px-3 py-3">{record.quality_status}</td>
                    <td className="px-3 py-3">{record.duplicate_status}</td>
                    <td className="px-3 py-3">{record.import_status}</td>
                    <td className="px-3 py-3">{record.rejection_reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function DuplicateReviewPanel({
  batchId,
  setBatchId,
  matches,
  loading,
  onLoad,
  onDecision,
}: {
  batchId: string;
  setBatchId: (value: string) => void;
  matches: DuplicateMatch[];
  loading: boolean;
  onLoad: () => void;
  onDecision: (
    match: DuplicateMatch,
    decision: "duplicate" | "unique" | "reject",
  ) => void;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-lg font-bold">Duplicates & Review</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-500">
            Review possible duplicates before publishing and decide whether
            staged rows should be marked duplicate, unique, or rejected.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-[280px_auto]">
          <TextField
            label="Batch ID optional"
            value={batchId}
            onChange={setBatchId}
            placeholder="Filter by batch"
          />
          <button
            type="button"
            onClick={onLoad}
            disabled={loading}
            className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white disabled:bg-zinc-700"
          >
            {loading ? "Loading..." : "Load Possible Duplicates"}
          </button>
        </div>
      </div>
      {matches.length === 0 ? (
        <div className="mt-5">
          <EmptyState text="No duplicate matches loaded." />
        </div>
      ) : null}
      <div className="mt-5 grid gap-4">
        {matches.map((match) => (
          <div
            key={match.id}
            className="rounded-2xl border border-white/10 bg-black/30 p-5"
          >
            <div className="grid gap-4 lg:grid-cols-[1fr_1fr_auto] lg:items-start">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  Staged
                </p>
                <h3 className="mt-2 font-black text-white">
                  {match.stagedName}
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {match.stagedAddress}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  Existing location
                </p>
                <h3 className="mt-2 font-black text-white">
                  {match.existingName}
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  {match.existingAddress}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">
                  Score
                </p>
                <p className="mt-2 text-3xl font-black text-rose-200">
                  {getNumber(match.duplicateScore)}
                </p>
              </div>
            </div>
            <p className="mt-4 text-sm text-zinc-400">
              Match reasons: {(match.matchReasons || []).join(", ") || "—"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <TinyButton onClick={() => onDecision(match, "duplicate")}>
                Mark as duplicate
              </TinyButton>
              <TinyButton onClick={() => onDecision(match, "unique")}>
                Mark as unique
              </TinyButton>
              <TinyButton onClick={() => onDecision(match, "reject")}>
                Reject
              </TinyButton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QrToolsPanel({
  summary,
  limit,
  setLimit,
  running,
  onGenerate,
}: {
  summary: GrowthSummary | null;
  limit: string;
  setLimit: (value: string) => void;
  running: boolean;
  onGenerate: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-6 shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
          QR / Claim QR Tools
        </p>
        <h2 className="mt-2 text-2xl font-black">
          Generate Missing QR / Claim QR Codes
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
          Create missing public QR codes and claim QR codes for clean live
          locations. Existing QR codes are not replaced.
        </p>
        {summary?.siteUrlConfigured === false ? (
          <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
            NEXT_PUBLIC_SITE_URL is missing. Configure it before bulk QR
            generation so claim URLs use the correct production domain.
          </div>
        ) : null}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <CompactStat
            label="Missing claim codes"
            value={getNumber(summary?.missingClaimCodes)}
          />
          <CompactStat
            label="Missing claim QR codes"
            value={getNumber(summary?.missingClaimQrs)}
          />
          <CompactStat
            label="Missing public QR codes"
            value={getNumber(summary?.missingPublicQrs)}
          />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-[240px_auto] sm:items-end">
          <NumberField label="Limit" value={limit} onChange={setLimit} />
          <button
            type="button"
            onClick={onGenerate}
            disabled={running}
            className="rounded-full bg-rose-600 px-7 py-4 text-sm font-black text-white shadow-xl shadow-rose-950/50 transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
          >
            {running ? "Generating..." : "Generate Missing QRs"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ActionCard({
  title,
  description,
  note,
  button,
  secondaryButton,
  tertiaryButton,
  running,
  onClick,
  onSecondaryClick,
  onTertiaryClick,
  children,
}: {
  title: string;
  description: string;
  note?: string;
  button: string;
  secondaryButton?: string;
  tertiaryButton?: string;
  running: boolean;
  onClick: () => void;
  onSecondaryClick?: () => void;
  onTertiaryClick?: () => void;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
      <h3 className="text-xl font-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p>
      {note ? (
        <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-rose-300">
          {note}
        </p>
      ) : null}
      {children ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">{children}</div>
      ) : null}
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onClick}
          disabled={running}
          className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
        >
          {running ? "Running..." : button}
        </button>
        {secondaryButton && onSecondaryClick ? (
          <button
            type="button"
            onClick={onSecondaryClick}
            disabled={running}
            className="rounded-full border border-white/10 px-6 py-3 text-sm font-black text-zinc-200 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
          >
            {running ? "Running..." : secondaryButton}
          </button>
        ) : null}
        {tertiaryButton && onTertiaryClick ? (
          <button
            type="button"
            onClick={onTertiaryClick}
            disabled={running}
            className="rounded-full border border-amber-300/20 px-6 py-3 text-sm font-black text-amber-100 transition hover:-translate-y-0.5 hover:border-amber-200 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
          >
            {tertiaryButton}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 text-sm font-black text-white outline-none transition focus:border-rose-400"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 text-sm font-black text-white outline-none transition placeholder:text-zinc-700 focus:border-rose-400"
      />
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 text-sm font-black text-white outline-none transition focus:border-rose-400"
      />
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </span>
      <div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-zinc-300">
        {value}
      </div>
    </div>
  );
}

function ResultBanner({
  result,
  onRunDedupe,
  onPublishBatch,
}: {
  result: ActionResult;
  onRunDedupe?: (batchId: string) => void;
  onPublishBatch?: (batchId: string) => void;
}) {
  const ok = result.success !== false && !result.error;
  const hasBatchMetrics = [
    "batchId",
    "limit",
    "offset",
    "nextOffset",
    "filterIndex",
    "filterLabel",
    "filterTag",
    "overpassEndpoint",
    "seen",
    "mapped",
    "staged",
    "duplicatesRemoved",
    "categoryGroup",
    "inserted",
    "markedPublished",
    "remainingPublishReady",
    "remainingUnchecked",
    "processed",
    "duplicate",
    "possibleDuplicate",
    "unique",
    "hasMore",
    "scope",
  ].some((key) => result[key] !== undefined);
  const errorText = typeof result.error === "string" ? result.error : "";
  const isAllOverpassFailure =
    !ok &&
    errorText
      .toLowerCase()
      .includes("all overpass endpoints rejected or timed out");
  return (
    <div
      className={`mb-6 rounded-3xl border p-5 text-sm ${ok ? "border-emerald-300/20 bg-emerald-500/10 text-emerald-100" : "border-red-300/20 bg-red-500/10 text-red-100"}`}
    >
      <p className="font-black">{ok ? "Action completed" : "Action failed"}</p>
      {result.error ? <p className="mt-2">{result.error}</p> : null}
      {isAllOverpassFailure ? (
        <p className="mt-2 font-bold">
          All Overpass endpoints rejected or timed out. Try another category
          group or wait a few minutes.
        </p>
      ) : null}
      {!isAllOverpassFailure &&
      !ok &&
      errorText.toLowerCase().includes("timeout") ? (
        <p className="mt-2 font-bold">
          OSM timed out. Try limit 100 or a smaller category group.
        </p>
      ) : null}
      {result.batchId && ok ? (
        <p className="mt-2 font-bold">
          Batch created: {String(result.batchId)}
        </p>
      ) : null}
      {ok && typeof result.message === "string" ? (
        <p className="mt-2 font-bold">{result.message}</p>
      ) : null}
      {ok && result.hasMore === true ? (
        <p className="mt-2 font-bold">
          More records remain. Run the next chunk.
        </p>
      ) : null}
      {ok && result.hasMore === false && Number(result.staged || 0) === 0 ? (
        <p className="mt-2 font-bold">
          No more records found for this OSM category. Reset the cursor or
          choose another category group.
        </p>
      ) : null}
      {hasBatchMetrics ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {[
            ["Batch ID", result.batchId],
            ["Scope", result.scope],
            ["Limit", result.limit],
            ["Offset", result.offset],
            ["Next offset", result.nextOffset],
            ["Filter index", result.filterIndex],
            ["Filter", result.filterLabel],
            ["Filter tag", result.filterTag],
            ["Overpass", result.overpassEndpoint],
            ["Bbox used", result.bboxUsed],
            ["Category", result.categoryGroup],
            ["Seen", result.seen],
            ["Mapped", result.mapped],
            ["Staged", result.staged],
            ["Duplicates removed", result.duplicatesRemoved],
            ["Inserted", result.inserted],
            ["Marked published", result.markedPublished],
            ["Remaining ready", result.remainingPublishReady],
            ["Processed", result.processed],
            ["Duplicate", result.duplicate],
            ["Possible duplicate", result.possibleDuplicate],
            ["Unique", result.unique],
            ["Remaining unchecked", result.remainingUnchecked],
            ["Has more", result.hasMore],
          ]
            .filter(([, value]) => value !== undefined && value !== null)
            .map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl bg-black/25 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] opacity-70">
                  {String(label)}
                </p>
                <p className="mt-1 break-all text-lg font-black text-white">
                  {typeof value === "number"
                    ? value.toLocaleString()
                    : String(value)}
                </p>
              </div>
            ))}
        </div>
      ) : null}
      <pre className="mt-3 max-h-56 overflow-auto rounded-2xl bg-black/30 p-3 text-xs text-zinc-200">
        {JSON.stringify(result, null, 2)}
      </pre>
      {result.batchId ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              navigator.clipboard?.writeText(String(result.batchId))
            }
            className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/10"
          >
            Copy batch ID
          </button>
          {onRunDedupe ? (
            <button
              type="button"
              onClick={() => onRunDedupe(String(result.batchId))}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/10"
            >
              Run dedupe
            </button>
          ) : null}
          {onPublishBatch ? (
            <button
              type="button"
              onClick={() => onPublishBatch(String(result.batchId))}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white hover:bg-white/10"
            >
              Publish this batch
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="mt-6 rounded-2xl border border-rose-400/20 bg-black/40 p-4">
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className="font-semibold text-rose-100">Import in progress</span>
        <span className="font-bold text-rose-300">{progress}%</span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-rose-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

function QualityPill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-3 py-1 text-emerald-200">
      ✓ {text}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-black/30 p-5">
      <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-black">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function CompactStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <p className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-black text-white">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white/[0.04] p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  );
}

function TinyButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/10 px-3 py-1.5 text-xs font-black text-zinc-200 transition hover:border-rose-300 hover:bg-white/10 hover:text-white"
    >
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  const isBad = ["error", "failed", "rejected"].includes(status);
  const isGood = ["success", "published", "staged", "completed"].includes(
    status,
  );
  return (
    <span
      className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-black ${isBad ? "bg-red-500/10 text-red-300" : isGood ? "bg-emerald-500/10 text-emerald-300" : "bg-white/10 text-zinc-300"}`}
    >
      {status}
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center text-sm text-zinc-400">
      {text}
    </div>
  );
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}
