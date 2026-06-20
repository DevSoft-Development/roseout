"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type TabId =
  | "google"
  | "nyc"
  | "osm"
  | "pictures"
  | "database"
  | "dedupe"
  | "publish"
  | "qr"
  | "history";

type ImportSectionMeta = {
  imported?: unknown;
  skipped?: unknown;
  failed?: unknown;
  total_found_from_google?: unknown;
  queries_used?: string[];
  requested_market?: unknown;
  requested_market_original?: unknown;
  requested_market_display?: unknown;
  requested_market_resolved?: unknown;
  requested_market_source?: unknown;
  market_resolution_confidence?: unknown;
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
  needsScoring?: number | null;
  missingClaimCodes?: number | null;
  missingClaimQrs?: number | null;
  missingPublicQrs?: number | null;
  chains?: number | null;
  utilityChains?: number | null;
  missingPhotos?: number | null;
  hasPhotos?: number | null;
  needsPhoto?: number | null;
  searchableWithPhotos?: number | null;
  missingPhotosTotal?: number | null;
  missingPhotosSearchable?: number | null;
  missingPhotosNotSearchable?: number | null;
  missingPhotosEligibleBackfill?: number | null;
  missingPhotosLowQuality?: number | null;
  searchableMissingPhotos?: number | null;
  nonSearchableMissingPhotos?: number | null;
  photoBacklogNoGooglePlaceId?: number | null;
  photoBacklogLowQuality?: number | null;
  totalTrueMissingPhotos?: number | null;
  missingPhotosDuplicates?: number | null;
  missingPhotosFailedBackfill?: number | null;
  missingPhotosWithBackfillError?: number | null;
  siteUrlConfigured?: boolean;
  siteUrl?: string | null;
  latestBatches?: LatestBatch[];
};


type MissingPhotoDiagnosticRow = {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  location_type?: string | null;
  city?: string | null;
  quality_score?: number | null;
  duplicate_status?: string | null;
  enrichment_status?: string | null;
  is_searchable?: boolean | null;
  reason?: string | null;
};

type MissingPhotoDiagnostics = {
  totalReturned: number;
  rows: MissingPhotoDiagnosticRow[];
};

type ActionResult = Record<string, unknown> & {
  success?: boolean;
  error?: string;
  batchId?: string;
  actionKey?: string;
  actionLabel?: string;
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

function getActionLabel(key: string) {
  const labels: Record<string, string> = {
    google: "Google Import",
    nyc: "NYC Import",
    osm: "OSM Import",
    "osm-test": "OSM Query Test",
    pictures: "Fix Pictures",
    database: "Database Cleanup",
    cleanup: "Database Cleanup",
    dedupe: "Dedupe",
    duplicates: "Duplicate Review",
    score: "Score Chunk",
    publish: "Publish Chunk",
    qr: "QR Generation",
    phones: "Phone Backfill",
    cuisine: "Cuisine Backfill",
    "classify-chains": "Classify Chains",
    "legacy-cleanup": "Legacy Cleanup",
    staging: "Staged Records",
    "duplicate-decision": "Duplicate Decision",
  };

  return labels[key] || key.replace(/-/g, " ");
}

function actionBelongsToTab(actionKey: unknown, activeTab: TabId) {
  const key = String(actionKey || "");

  const tabActions: Record<TabId, string[]> = {
    google: ["google", "phones", "cuisine", "legacy-cleanup"],
    nyc: ["nyc"],
    osm: ["osm", "osm-test"],
    pictures: ["pictures"],
    database: ["database", "cleanup", "classify-chains", "phones", "cuisine"],
    dedupe: ["dedupe", "duplicates", "duplicate-decision"],
    publish: ["score", "publish"],
    qr: ["qr"],
    history: ["staging"],
  };

  if (!key) return true;
  return tabActions[activeTab]?.includes(key) ?? false;
}

function isNoisyUtilityLog(log: ImportLog) {
  const job = String(log.job_name || "").toLowerCase();

  return [
    "restaurant_cuisine_backfill",
    "phone_backfill",
    "review_count_backfill",
    "cleanup_missing_address",
  ].includes(job);
}

function getVisibleHistoryLogs(logs: ImportLog[]) {
  return logs.filter((log) => !isNoisyUtilityLog(log)).slice(0, 12);
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function percentFromParts(done: number, total: number) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return clampPercent((done / total) * 100);
}

function progressLabel(done: number, total: number) {
  return `${done.toLocaleString()} of ${total.toLocaleString()}`;
}

function getGoogleProgress({
  running,
  progress,
  totals,
}: {
  running: boolean;
  progress: number;
  totals: {
    imported: number;
    skipped: number;
    failed: number;
    found: number;
    errors: number;
  };
}) {
  if (running) {
    return {
      percent: progress,
      label: "Google import running",
      detail: "Importing live Google results into TheOutHaven.",
      doneLabel: `${progress}%`,
      tone: "rose" as ProgressTone,
    };
  }

  const completed = totals.imported + totals.skipped;
  const total = Math.max(completed + totals.failed, totals.found, 0);

  return {
    percent: total > 0 ? percentFromParts(completed, total) : 0,
    label: "Google import progress",
    detail:
      total > 0
        ? `${completed.toLocaleString()} imported or skipped from ${total.toLocaleString()} found.`
        : "No Google import results yet.",
    doneLabel: total > 0 ? progressLabel(completed, total) : "Not started",
    tone: "rose" as ProgressTone,
  };
}

function getNycProgress(summary: GrowthSummary | null) {
  const staged = getNumber(summary?.staged);
  const publishReady = getNumber(summary?.publishReady);
  const rejected = getNumber(summary?.rejected);
  const duplicates = getNumber(summary?.duplicates);
  const possible = getNumber(summary?.possibleDuplicates);
  const completed = publishReady + rejected + duplicates;
  const total = Math.max(staged + completed + possible, completed);

  return {
    percent: total > 0 ? percentFromParts(completed, total) : 0,
    label: "NYC import pipeline",
    detail:
      total > 0
        ? "Tracks staged NYC records moving through scoring, dedupe, rejection, and publish-ready states."
        : "No staged NYC import records found yet.",
    doneLabel: total > 0 ? progressLabel(completed, total) : "Not started",
    tone: "rose" as ProgressTone,
  };
}

function getOsmProgress(summary: GrowthSummary | null) {
  const staged = getNumber(summary?.staged);
  const needsScoring = getNumber(summary?.needsScoring);
  const publishReady = getNumber(summary?.publishReady);
  const rejected = getNumber(summary?.rejected);
  const possible = getNumber(summary?.possibleDuplicates);
  const completed = publishReady + rejected;
  const total = Math.max(staged + needsScoring + possible + completed, completed);

  return {
    percent: total > 0 ? percentFromParts(completed, total) : 0,
    label: "OSM activity import pipeline",
    detail:
      total > 0
        ? "Tracks imported activity records through scoring, review, and publish readiness."
        : "No staged OSM activity records found yet.",
    doneLabel: total > 0 ? progressLabel(completed, total) : "Not started",
    tone: "rose" as ProgressTone,
  };
}

function getPictureProgress(summary: GrowthSummary | null) {
  const searchableWithPhotos = getNumber(summary?.searchableWithPhotos);
  const searchableMissingPhotos = getNumber(
    summary?.searchableMissingPhotos ?? summary?.missingPhotosSearchable,
  );
  const total = searchableWithPhotos + searchableMissingPhotos;

  return {
    percent: total > 0 ? percentFromParts(searchableWithPhotos, total) : 0,
    label: "Searchable photo coverage",
    detail:
      total > 0
        ? "Tracks public/searchable records with usable photos versus searchable missing-photo records."
        : "No searchable photo coverage data available yet.",
    doneLabel:
      searchableMissingPhotos === 0
        ? "Searchable photo coverage is complete."
        : total > 0
          ? progressLabel(searchableWithPhotos, total)
          : "No data",
    tone:
      searchableMissingPhotos > 0 ? ("rose" as ProgressTone) : ("zinc" as ProgressTone),
  };
}

function getDatabaseProgress(summary: GrowthSummary | null) {
  const live = getNumber(summary?.liveLocations);
  const needsReview = getNumber(summary?.needsReview);
  const duplicates = getNumber(summary?.duplicates);
  const issues = needsReview + duplicates;
  const clean = Math.max(live - issues, 0);

  return {
    percent: live > 0 ? percentFromParts(clean, live) : 0,
    label: "Database health",
    detail:
      live > 0
        ? "Tracks clean live locations versus records needing review or duplicate cleanup."
        : "No live location count available yet.",
    doneLabel: live > 0 ? progressLabel(clean, live) : "No data",
    tone: issues > 0 ? ("rose" as ProgressTone) : ("zinc" as ProgressTone),
  };
}

function getDedupeProgress(summary: GrowthSummary | null) {
  const staged = getNumber(summary?.staged);
  const remaining = getNumber(summary?.remainingUncheckedDedupe);
  const checked = Math.max(staged - remaining, 0);

  return {
    percent: staged > 0 ? percentFromParts(checked, staged) : 0,
    label: "Dedupe review progress",
    detail:
      staged > 0
        ? "Tracks staged records that have been checked against possible duplicates."
        : "No staged records available for dedupe.",
    doneLabel: staged > 0 ? progressLabel(checked, staged) : "No data",
    tone: remaining > 0 ? ("rose" as ProgressTone) : ("zinc" as ProgressTone),
  };
}

function getPublishProgress(summary: GrowthSummary | null) {
  const publishReady = getNumber(summary?.publishReady);
  const remainingReady = getNumber(summary?.remainingPublishReady ?? summary?.publishReady);
  const publishedLatest = getNumber(summary?.latestBatches?.[0]?.total_published);
  const completed = Math.max(publishReady - remainingReady, publishedLatest, 0);
  const total = Math.max(publishReady, completed + remainingReady);

  return {
    percent: total > 0 ? percentFromParts(completed, total) : 0,
    label: "Publish progress",
    detail:
      total > 0
        ? "Tracks publish-ready records that have moved into live locations."
        : "No publish-ready records available yet.",
    doneLabel: total > 0 ? progressLabel(completed, total) : "No data",
    tone: remainingReady > 0 ? ("rose" as ProgressTone) : ("zinc" as ProgressTone),
  };
}

function getQrProgress(summary: GrowthSummary | null) {
  const live = getNumber(summary?.liveLocations);
  const missingClaimCodes = getNumber(summary?.missingClaimCodes);
  const missingClaimQrs = getNumber(summary?.missingClaimQrs);
  const missingPublicQrs = getNumber(summary?.missingPublicQrs);
  const missingAny = Math.max(missingClaimCodes, missingClaimQrs, missingPublicQrs);
  const complete = Math.max(live - missingAny, 0);

  return {
    percent: live > 0 ? percentFromParts(complete, live) : 0,
    label: "QR completion",
    detail:
      live > 0
        ? "Tracks locations with claim codes, claim QR codes, and public QR codes completed."
        : "No live location count available yet.",
    doneLabel: live > 0 ? progressLabel(complete, live) : "No data",
    tone: missingAny > 0 ? ("rose" as ProgressTone) : ("zinc" as ProgressTone),
  };
}

function getHistoryProgress(logs: ImportLog[]) {
  const total = logs.length;
  const failed = logs.filter((log) => Boolean(log.error)).length;
  const successful = Math.max(total - failed, 0);

  return {
    percent: total > 0 ? percentFromParts(successful, total) : 0,
    label: "Import run health",
    detail:
      total > 0
        ? "Tracks successful import runs versus import runs with errors."
        : "No import history found yet.",
    doneLabel: total > 0 ? progressLabel(successful, total) : "No history",
    tone: failed > 0 ? ("rose" as ProgressTone) : ("zinc" as ProgressTone),
  };
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
  { label: "Northern New Jersey", value: "northern_nj" },
  { label: "Long Island", value: "long_island" },
  { label: "Westchester", value: "westchester" },
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
const OSM_CATEGORY_GROUPS = [
  "nightlife",
  "culture",
  "bowling",
  "karaoke",
  "mini_golf",
  "dessert",
  "cafes",
  "parks",
  "all",
];

function normalizeOsmCategoryGroup(group: string) {
  return group === "activities"
    ? "bowling"
    : group || DEFAULT_OSM_CATEGORY_GROUP;
}

function getOsmLimitCap(group: string) {
  const normalizedGroup = normalizeOsmCategoryGroup(group);
  if (normalizedGroup === "parks") return 10;
  if (normalizedGroup === "all") return 10;
  return 100;
}

function getOsmCursorKey(group: string) {
  return `theouthaven_osm_import_cursor_${group || "all"}`;
}

function getLegacyOsmOffsetKey(group: string) {
  return `theouthaven_osm_import_offset_${group || "all"}`;
}

function readSavedOsmCursor(group: string) {
  const normalizedGroup = normalizeOsmCategoryGroup(group);
  const cursorText = window.localStorage.getItem(
    getOsmCursorKey(normalizedGroup),
  );
  if (cursorText) {
    try {
      const cursor = JSON.parse(cursorText) as {
        categoryGroup?: unknown;
        filterIndex?: unknown;
        offset?: unknown;
        exhausted?: unknown;
      };
      return {
        categoryGroup: String(cursor.categoryGroup || normalizedGroup),
        filterIndex: String(Number(cursor.filterIndex) || 0),
        offset: String(Number(cursor.offset) || 0),
        exhausted: Boolean(cursor.exhausted),
      };
    } catch {
      window.localStorage.removeItem(getOsmCursorKey(normalizedGroup));
    }
  }

  const legacyOffset = window.localStorage.getItem(
    getLegacyOsmOffsetKey(normalizedGroup),
  );
  return {
    categoryGroup: normalizedGroup,
    filterIndex: "0",
    offset: legacyOffset || "0",
    exhausted: false,
  };
}

function saveOsmCursor(
  group: string,
  filterIndex: string,
  offset: string,
  exhausted = false,
) {
  const normalizedGroup = normalizeOsmCategoryGroup(group);
  window.localStorage.setItem(
    getOsmCursorKey(normalizedGroup),
    JSON.stringify({
      categoryGroup: normalizedGroup,
      filterIndex: Number(filterIndex) || 0,
      offset: Number(offset) || 0,
      exhausted,
    }),
  );
  window.localStorage.setItem(getLegacyOsmOffsetKey(normalizedGroup), offset);
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
  { id: "google", label: "Google Imports" },
  { id: "nyc", label: "NYC Imports" },
  { id: "osm", label: "OSM / Activities" },
  { id: "pictures", label: "Fix Pictures" },
  { id: "database", label: "Fix Database" },
  { id: "dedupe", label: "Dedupe / Review" },
  { id: "publish", label: "Publish" },
  { id: "qr", label: "QR Codes" },
  { id: "history", label: "Import History" },
];

const validTabs: TabId[] = [
  "google",
  "nyc",
  "osm",
  "pictures",
  "database",
  "dedupe",
  "publish",
  "qr",
  "history",
];

export default function ImportPage() {
  return (
    <Suspense fallback={<ImportPageShell />}>
      <ImportPageContent />
    </Suspense>
  );
}

function ImportPageShell() {
  return (
    <main className="min-h-screen bg-[#090506] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 shadow-2xl shadow-black/40">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-rose-300">
          TheOutHaven Admin
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
          Import Center
        </h1>
        <p className="mt-3 text-sm text-zinc-400">Loading import tabs...</p>
      </div>
    </main>
  );
}

function ImportPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [activeTab, setActiveTabState] = useState<TabId>("google");
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
  const [osmLimit, setOsmLimit] = useState("25");
  const [osmOffset, setOsmOffset] = useState("0");
  const [osmFilterIndex, setOsmFilterIndex] = useState("0");
  const [osmCategoryGroup, setOsmCategoryGroup] = useState(
    DEFAULT_OSM_CATEGORY_GROUP,
  );
  const [osmDebugTagKey, setOsmDebugTagKey] = useState("amenity");
  const [osmDebugTagValue, setOsmDebugTagValue] = useState("bar");
  const [osmDebugBbox, setOsmDebugBbox] = useState("nyc_metro");
  const [osmDebugQueryMode, setOsmDebugQueryMode] = useState("node_only");
  const [dedupeBatchId, setDedupeBatchId] = useState("");
  const [scoreBatchId, setScoreBatchId] = useState("");
  const [publishBatchId, setPublishBatchId] = useState("");
  const [dedupeScope, setDedupeScope] = useState("all");
  const [scoreScope, setScoreScope] = useState("all");
  const [publishScope, setPublishScope] = useState("all");
  const [publishLimit, setPublishLimit] = useState("500");
  const [dedupeLimit, setDedupeLimit] = useState("250");
  const [scoreLimit, setScoreLimit] = useState("250");
  const [photoFixLimit, setPhotoFixLimit] = useState("50");
  const [photoBackfillLimit, setPhotoBackfillLimit] = useState("25");
  const [dbFixLimit, setDbFixLimit] = useState("500");
  const [qrLimit, setQrLimit] = useState("100");
  const [cleanupOffset, setCleanupOffset] = useState("0");
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    document.title = "Import Center | TheOutHaven Admin";
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab") as TabId | "growth" | "duplicates" | null;

    if (tab && validTabs.includes(tab as TabId)) {
      setActiveTabState((current) => {
        const next = tab as TabId;
        if (current !== next) {
          setActionResult(null);
          setProgress(0);
        }
        return next;
      });
      return;
    }

    if (tab === "growth") {
      setActiveTabState("nyc");
      setActionResult(null);
      setProgress(0);
      router.replace("/admin/dashboard/import?tab=nyc", { scroll: false });
      return;
    }

    if (tab === "duplicates") {
      setActiveTabState("dedupe");
      setActionResult(null);
      setProgress(0);
      router.replace("/admin/dashboard/import?tab=dedupe", { scroll: false });
    }
  }, [router, searchParams]);

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

  const setActiveTab = useCallback(
    (tab: TabId) => {
      setActiveTabState(tab);
      setActionResult(null);
      setProgress(0);
      router.replace(`/admin/dashboard/import?tab=${tab}`, { scroll: false });
      fetchSummary();
      if (tab === "google" || tab === "history") {
        fetchLogs();
      }
    },
    [fetchLogs, fetchSummary, router],
  );

  useEffect(() => {
    // Initial data load is intentionally kicked off once the import center mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
    fetchSummary();
  }, [fetchLogs, fetchSummary]);

  useEffect(() => {
    if (!runningAction) {
      // Progress is visual-only and resets once the active admin action stops.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(0);
      return;
    }

    setProgress(10);

    const timer = window.setInterval(() => {
      setProgress((previous) => {
        if (previous >= 94) return previous;
        if (runningAction === "google") return previous + 5;
        if (runningAction === "nyc") return previous + 4;
        if (runningAction === "osm") return previous + 4;
        if (runningAction === "pictures") return previous + 4;
        if (runningAction === "qr") return previous + 4;
        return previous + 3;
      });
    }, 650);

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
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const data = await parseActionResponse(res);
      let actionData = data;
      if (key === "pictures") {
        const summaryRes = await fetch("/api/admin/location-growth/summary", {
          cache: "no-store",
        });
        const latestSummary = await summaryRes.json();
        if (summaryRes.ok) {
          actionData = {
            ...data,
            searchableMissingPhotosRemaining: getNumber(
              latestSummary.searchableMissingPhotos ?? latestSummary.missingPhotosSearchable,
            ),
            totalNonSearchablePhotoBacklog: getNumber(
              latestSummary.nonSearchableMissingPhotos ?? latestSummary.missingPhotosNotSearchable,
            ),
          };
        }
      }
      setProgress(100);
      setActionResult({
        ...actionData,
        actionKey: key,
        actionLabel: getActionLabel(key),
      });
      if (data.batchId) {
        setDedupeBatchId(String(data.batchId));
        setScoreBatchId(String(data.batchId));
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
        actionKey: key,
        actionLabel: getActionLabel(key),
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
        actionKey: "google",
        actionLabel: getActionLabel("google"),
      });
      return;
    }

    await postAction("google", "/api/admin/run-google-import", {
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
      setActiveTab("dedupe");
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
    const limit = Number(osmLimit || 25);
    const maxLimit = getOsmLimitCap(osmCategoryGroup);
    if (!Number.isFinite(limit)) return Math.min(25, maxLimit);
    return Math.min(Math.max(Math.trunc(limit), 1), maxLimit);
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
        categoryGroup: normalizeOsmCategoryGroup(osmCategoryGroup),
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
          normalizeOsmCategoryGroup(osmCategoryGroup),
          String(nextFilterIndex),
          String(nextOffset),
          data.hasMore === false,
        );
      }
    }
  };

  const handleOsmCategoryGroupChange = (nextGroup: string) => {
    const normalizedGroup = normalizeOsmCategoryGroup(nextGroup);
    setOsmCategoryGroup(normalizedGroup);
    const saved = readSavedOsmCursor(normalizedGroup);
    setOsmOffset(saved.offset);
    setOsmFilterIndex(saved.filterIndex);
    const maxLimit = getOsmLimitCap(normalizedGroup);
    setOsmLimit((currentLimit) => {
      const numericLimit = Number(currentLimit || 25);
      if (!Number.isFinite(numericLimit)) return String(Math.min(25, maxLimit));
      return String(Math.min(Math.max(Math.trunc(numericLimit), 1), maxLimit));
    });
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
    OSM_CATEGORY_GROUPS.forEach((group) => {
      saveOsmCursor(group, "0", "0");
    });
    setOsmOffset("0");
    setOsmFilterIndex("0");
  };

  const testOsmQuery = () =>
    postAction("osm-test", "/api/admin/location-growth/test-osm", {
      tagKey: osmDebugTagKey || "amenity",
      tagValue: osmDebugTagValue || "bar",
      bbox: osmDebugBbox || "nyc_metro",
      queryMode: osmDebugQueryMode || "node_only",
    });

  const runPhotoMigration = (mode: string, limit = Number(photoFixLimit) || 50) =>
    postAction("pictures", "/api/admin/location-growth/migrate-enriched-photos", {
      mode,
      limit: Math.min(Math.max(limit, 1), 250),
    });

  const runPhotoBackfill = () =>
    postAction("pictures", "/api/admin/location-growth/enrich-high-value", {
      limit: Math.min(Math.max(Number(photoBackfillLimit) || 25, 1), 100),
    });

  const runDatabaseFix = async () => {
    const data = await postAction("database", "/api/admin/cleanup-locations", {
      table: "locations",
      limit: Math.min(Math.max(Number(dbFixLimit) || 500, 1), 1000),
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
            <div className="absolute bottom-0 left-0 h-44 w-44 rounded-full bg-rose-950/20 blur-3xl" />
            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-rose-300">
                  Location Operations
                </p>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Import & Maintenance Center
                </h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-400">
                  Part of Location Operations: manage Google imports, staged location growth, dedupe,
                  enrichment, cleanup, publish, photo, QR, and history tools from one safe admin workspace.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/dashboard/locations"
                  className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-zinc-200 transition hover:border-rose-300 hover:bg-white/10"
                >
                  Back to Locations
                </Link>
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

        {actionResult && actionBelongsToTab(actionResult.actionKey, activeTab) ? (
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
              setActiveTab("publish");
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

        {activeTab === "nyc" ? (
          <NycImportsPanel
            summary={summary}
            runningAction={runningAction}
            progress={progress}
            nycLimit={nycLimit}
            setNycLimit={setNycLimit}
            nycOffset={nycOffset}
            setNycOffset={setNycOffset}
            onImportNyc={runNycImport}
            onImportNycNext={runNycImport}
          />
        ) : null}

        {activeTab === "osm" ? (
          <OsmImportsPanel
            summary={summary}
            runningAction={runningAction}
            progress={progress}
            osmLimit={osmLimit}
            setOsmLimit={setOsmLimit}
            osmOffset={osmOffset}
            setOsmOffset={setOsmOffset}
            osmCategoryGroup={osmCategoryGroup}
            osmFilterIndex={osmFilterIndex}
            setOsmFilterIndex={setOsmFilterIndex}
            setOsmCategoryGroup={handleOsmCategoryGroupChange}
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
            osmDebugQueryMode={osmDebugQueryMode}
            setOsmDebugQueryMode={setOsmDebugQueryMode}
            onTestOsmQuery={testOsmQuery}
          />
        ) : null}

        {activeTab === "pictures" ? (
          <FixPicturesPanel
            summary={summary}
            runningAction={runningAction}
            progress={progress}
            photoFixLimit={photoFixLimit}
            setPhotoFixLimit={setPhotoFixLimit}
            photoBackfillLimit={photoBackfillLimit}
            setPhotoBackfillLimit={setPhotoBackfillLimit}
            onRepairBadPlaceholders={() => runPhotoMigration("repair_bad_placeholders")}
            onMigrateGooglePhotos={() => runPhotoMigration("google_endpoint_to_storage")}
            onRetryCompletedMissing={() => runPhotoMigration("repair_missing_completed")}
            onBackfillMissingPhotos={runPhotoBackfill}
          />
        ) : null}

        {activeTab === "database" ? (
          <FixDatabasePanel
            summary={summary}
            runningAction={runningAction}
            progress={progress}
            cleanupOffset={cleanupOffset}
            setCleanupOffset={setCleanupOffset}
            dbFixLimit={dbFixLimit}
            setDbFixLimit={setDbFixLimit}
            onCleanup={runDatabaseFix}
            onClassifyChains={() =>
              postAction("classify-chains", "/api/admin/location-growth/classify-chains", {
                limit: 500,
              })
            }
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
          />
        ) : null}

        {activeTab === "dedupe" ? (
          <DedupePanel
            summary={summary}
            runningAction={runningAction}
            progress={progress}
            dedupeScope={dedupeScope}
            setDedupeScope={setDedupeScope}
            dedupeBatchId={dedupeBatchId}
            setDedupeBatchId={setDedupeBatchId}
            dedupeLimit={dedupeLimit}
            setDedupeLimit={setDedupeLimit}
            duplicateBatchId={duplicateBatchId}
            setDuplicateBatchId={setDuplicateBatchId}
            duplicates={duplicates}
            onDedupe={() =>
              postAction("dedupe", "/api/admin/location-growth/dedupe", {
                all: dedupeScope !== "batch",
                batchId: dedupeScope === "batch" ? dedupeBatchId || undefined : undefined,
                limit: Math.min(Math.max(Number(dedupeLimit || 250), 1), 500),
              })
            }
            onLoadDuplicates={() => loadDuplicates()}
            onDecision={decideDuplicate}
          />
        ) : null}

        {activeTab === "publish" ? (
          <PublishPanel
            summary={summary}
            runningAction={runningAction}
            progress={progress}
            scoreScope={scoreScope}
            setScoreScope={setScoreScope}
            scoreBatchId={scoreBatchId}
            setScoreBatchId={setScoreBatchId}
            scoreLimit={scoreLimit}
            setScoreLimit={setScoreLimit}
            publishScope={publishScope}
            setPublishScope={setPublishScope}
            publishBatchId={publishBatchId}
            setPublishBatchId={setPublishBatchId}
            publishLimit={publishLimit}
            setPublishLimit={setPublishLimit}
            onScore={() =>
              postAction("score", "/api/admin/location-growth/score-staged", {
                batchId: scoreScope === "batch" ? scoreBatchId || undefined : undefined,
                limit: Math.min(Math.max(Number(scoreLimit || 250), 1), 500),
              })
            }
            onPublish={() => {
              const limit = Math.min(Math.max(Number(publishLimit || 500), 1), 1000);
              const publishAll = publishScope !== "batch";

              if (!publishAll && !publishBatchId.trim()) {
                setActionResult({
                  success: false,
                  error: "Select a batch or switch scope to Publish All Ready.",
                  actionKey: "publish",
                  actionLabel: getActionLabel("publish"),
                });
                return null;
              }

              return postAction(
                "publish",
                "/api/admin/location-growth/publish",
                publishAll ? { all: true, limit } : { batchId: publishBatchId, limit },
                {
                  confirm: publishAll
                    ? `You are about to publish up to ${limit} clean, unique, publish-ready staged records into live locations. Existing CRM, claimed owner, reservation, and QR data will not be overwritten. Continue?`
                    : `You are about to publish up to ${limit} clean, unique records from this batch. Continue?`,
                },
              );
            }}
          />
        ) : null}

        {activeTab === "history" ? (
          <ImportHistoryPanel
            summary={summary}
            logs={logs}
            loading={summaryLoading}
            progress={progress}
            stagedRecords={stagedRecords}
            stagingBatchId={stagingBatchId}
            onCopy={(batchId) => navigator.clipboard?.writeText(batchId)}
            onDedupe={(batchId) => {
              setDedupeScope("batch");
              setDedupeBatchId(batchId);
              setActiveTab("dedupe");
            }}
            onPublish={(batchId) => {
              setPublishScope("batch");
              setPublishBatchId(batchId);
              setActiveTab("publish");
            }}
            onViewStaged={loadStagedRecords}
            onViewDuplicates={(batchId) => loadDuplicates(batchId)}
          />
        ) : null}

        {activeTab === "qr" ? (
          <QrToolsPanel
            summary={summary}
            limit={qrLimit}
            setLimit={setQrLimit}
            running={runningAction === "qr"}
            progress={progress}
            onGenerate={() =>
              postAction(
                "qr",
                "/api/admin/location-growth/generate-missing-qrs",
                { limit: Number(qrLimit) || 100 },
                {
                  confirm:
                    "Generate only missing public and claim QR codes? Existing QR fields will not be replaced.",
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

        <TabProcessBar
          {...getGoogleProgress({
            running,
            progress,
            totals,
          })}
          running={running}
        />

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
          <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
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
                  {meta.requested_market || meta.requested_market_resolved || meta.requested_market_display || meta.requested_market_original ? (
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {[
                        ["Requested market", meta.requested_market_resolved || meta.requested_market || "—"],
                        ["Source", meta.requested_market_display || meta.requested_market_original || "—"],
                        ["Confidence", meta.market_resolution_confidence || "—"],
                      ].map(([label, value]) => (
                        <div key={String(label)} className="rounded-2xl bg-black/25 p-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-zinc-500">
                            {String(label)}
                          </p>
                          <p className="mt-1 break-words text-sm font-black text-white">
                            {String(value)}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {log.error ? (
                    <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-500/10 p-3 text-sm text-rose-100">
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

function getRunningProgress({
  basePercent,
  running,
  progress,
}: {
  basePercent: number;
  running: boolean;
  progress: number;
}) {
  if (!running) return clampPercent(basePercent);
  return Math.max(clampPercent(basePercent), clampPercent(progress));
}

function NycImportsPanel({
  summary,
  runningAction,
  progress,
  nycLimit,
  setNycLimit,
  nycOffset,
  setNycOffset,
  onImportNyc,
  onImportNycNext,
}: {
  summary: GrowthSummary | null;
  runningAction: string | null;
  progress: number;
  nycLimit: string;
  setNycLimit: (value: string) => void;
  nycOffset: string;
  setNycOffset: (value: string) => void;
  onImportNyc: () => void;
  onImportNycNext: () => void;
}) {
  const sectionProgress = getNycProgress(summary);
  const isRunning = runningAction === "nyc";

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-[#0D0708] p-6 shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">NYC Imports</p>
        <h2 className="mt-2 text-2xl font-black text-white">NYC Open Data Restaurants</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Import NYC restaurant records into staging. They will not go live until they are scored, deduped, reviewed, and published.</p>
        <TabProcessBar {...sectionProgress} percent={getRunningProgress({ basePercent: sectionProgress.percent, running: isRunning, progress })} doneLabel={isRunning ? `${progress}% running` : sectionProgress.doneLabel} running={isRunning} />
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <CompactStat label="Staged" value={getNumber(summary?.staged)} />
          <CompactStat label="Needs Scoring" value={getNumber(summary?.needsScoring)} />
          <CompactStat label="Publish Ready" value={getNumber(summary?.publishReady)} />
          <CompactStat label="Rejected" value={getNumber(summary?.rejected)} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-[220px_220px_auto] sm:items-end">
          <NumberField label="Limit" value={nycLimit} onChange={setNycLimit} min={1} max={1000} />
          <NumberField label="Offset" value={nycOffset} onChange={setNycOffset} min={0} />
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={onImportNyc} disabled={Boolean(runningAction)} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700">{isRunning ? "Importing..." : "Import NYC Batch"}</button>
            <button type="button" onClick={onImportNycNext} disabled={Boolean(runningAction)} className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-black text-zinc-200 transition hover:bg-white/10 disabled:opacity-50">Import Next NYC Batch</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function OsmImportsPanel(props: {
  summary: GrowthSummary | null;
  runningAction: string | null;
  progress: number;
  osmLimit: string;
  setOsmLimit: (value: string) => void;
  osmOffset: string;
  setOsmOffset: (value: string) => void;
  osmCategoryGroup: string;
  osmFilterIndex: string;
  setOsmFilterIndex: (value: string) => void;
  setOsmCategoryGroup: (value: string) => void;
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
  osmDebugQueryMode: string;
  setOsmDebugQueryMode: (value: string) => void;
  onTestOsmQuery: () => void;
}) {
  const sectionProgress = getOsmProgress(props.summary);
  const isRunning = props.runningAction === "osm" || props.runningAction === "osm-test";
  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-[#0D0708] p-6 shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">OSM / Activities</p>
        <h2 className="mt-2 text-2xl font-black text-white">Import Activity Locations</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Import activity locations from OSM using category-specific cursors so completed batches are not repeated.</p>
        <TabProcessBar {...sectionProgress} percent={getRunningProgress({ basePercent: sectionProgress.percent, running: isRunning, progress: props.progress })} doneLabel={isRunning ? `${props.progress}% running` : sectionProgress.doneLabel} running={isRunning} />
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <CompactStat label="Staged" value={getNumber(props.summary?.staged)} />
          <CompactStat label="Needs Scoring" value={getNumber(props.summary?.needsScoring)} />
          <CompactStat label="Possible Duplicates" value={getNumber(props.summary?.possibleDuplicates)} />
          <CompactStat label="Publish Ready" value={getNumber(props.summary?.publishReady)} />
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField label="Category group" value={props.osmCategoryGroup} onChange={props.setOsmCategoryGroup} options={[{ label: "Nightlife", value: "nightlife" }, { label: "Culture", value: "culture" }, { label: "Bowling", value: "bowling" }, { label: "Karaoke", value: "karaoke" }, { label: "Mini golf", value: "mini_golf" }, { label: "Dessert", value: "dessert" }, { label: "Cafes", value: "cafes" }, { label: "Parks", value: "parks" }, { label: "All advanced", value: "all" }]} />
          <NumberField label="Limit" value={props.osmLimit} onChange={props.setOsmLimit} min={1} max={1000} />
          <NumberField label="Cursor offset" value={props.osmOffset} onChange={props.setOsmOffset} min={0} />
          <NumberField label="Cursor filter index" value={props.osmFilterIndex} onChange={props.setOsmFilterIndex} min={0} />
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={props.onImportOsm} disabled={Boolean(props.runningAction)} className="rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 transition hover:bg-rose-500 disabled:bg-zinc-700">{props.runningAction === "osm" ? "Importing..." : "Import OSM Batch"}</button>
          <button type="button" onClick={props.onImportOsmNext} disabled={Boolean(props.runningAction)} className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-black text-zinc-200 transition hover:bg-white/10 disabled:opacity-50">Import Next OSM Batch</button>
          <button type="button" onClick={props.onResetOsmOffset} disabled={Boolean(props.runningAction)} className="rounded-full border border-rose-300/20 bg-rose-500/10 px-6 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/15 disabled:opacity-50">Reset This Cursor</button>
          <button type="button" onClick={props.onResetAllOsmCursors} disabled={Boolean(props.runningAction)} className="rounded-full border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-black text-zinc-200 transition hover:bg-white/10 disabled:opacity-50">Reset All Cursors</button>
        </div>
        <details className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.22em] text-zinc-400">Test OSM Query</summary>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <TextField label="Tag key" value={props.osmDebugTagKey} onChange={props.setOsmDebugTagKey} placeholder="amenity" />
            <TextField label="Tag value" value={props.osmDebugTagValue} onChange={props.setOsmDebugTagValue} placeholder="bar" />
            <SelectField label="Bbox" value={props.osmDebugBbox} onChange={props.setOsmDebugBbox} options={[{ label: "NYC", value: "nyc" }, { label: "NYC Metro", value: "nyc_metro" }]} />
            <SelectField label="Query mode" value={props.osmDebugQueryMode} onChange={props.setOsmDebugQueryMode} options={[{ label: "Node only", value: "node_only" }, { label: "N/W/R", value: "nwr" }]} />
            <button type="button" onClick={props.onTestOsmQuery} disabled={props.runningAction === "osm-test"} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:bg-zinc-700">{props.runningAction === "osm-test" ? "Testing..." : "Test OSM"}</button>
          </div>
        </details>
      </section>
    </div>
  );
}

function FixPicturesPanel({ summary, runningAction, progress, photoFixLimit, setPhotoFixLimit, photoBackfillLimit, setPhotoBackfillLimit, onRepairBadPlaceholders, onMigrateGooglePhotos, onRetryCompletedMissing, onBackfillMissingPhotos }: { summary: GrowthSummary | null; runningAction: string | null; progress: number; photoFixLimit: string; setPhotoFixLimit: (value: string) => void; photoBackfillLimit: string; setPhotoBackfillLimit: (value: string) => void; onRepairBadPlaceholders: () => void; onMigrateGooglePhotos: () => void; onRetryCompletedMissing: () => void; onBackfillMissingPhotos: () => void; }) {
  const sectionProgress = getPictureProgress(summary);
  const isRunning = runningAction === "pictures";
  const disabled = Boolean(runningAction);
  const [diagnostics, setDiagnostics] = useState<MissingPhotoDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);

  const loadDiagnostics = async () => {
    try {
      setDiagnosticsLoading(true);
      setDiagnosticsError(null);
      const res = await fetch(
        "/api/admin/location-growth/missing-photo-diagnostics",
        { cache: "no-store" },
      );
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || "Could not load missing-photo diagnostics");
      }
      setDiagnostics({
        totalReturned: Number(data.totalReturned) || 0,
        rows: data.rows || [],
      });
    } catch (error) {
      setDiagnosticsError(error instanceof Error ? error.message : String(error));
      setDiagnostics(null);
    } finally {
      setDiagnosticsLoading(false);
    }
  };

  const searchableMissingPhotos = getNumber(
    summary?.searchableMissingPhotos ?? summary?.missingPhotosSearchable,
  );
  const totalPhotoBacklog = getNumber(
    summary?.totalTrueMissingPhotos ?? summary?.missingPhotosTotal,
  );
  const nonSearchableMissingPhotos = getNumber(
    summary?.nonSearchableMissingPhotos ?? summary?.missingPhotosNotSearchable,
  );
  const photoBacklogNoGooglePlaceId = getNumber(summary?.photoBacklogNoGooglePlaceId);
  const photoBacklogLowQuality = getNumber(
    summary?.photoBacklogLowQuality ?? summary?.missingPhotosLowQuality,
  );
  const searchablePhotoCoverageComplete = searchableMissingPhotos === 0;
  const backfillDisabled = disabled || searchablePhotoCoverageComplete;
  const secondaryPhotoStats = [
    { label: "Total Photo Backlog", value: totalPhotoBacklog },
    { label: "Non-searchable Missing", value: nonSearchableMissingPhotos },
    { label: "No Google Place ID", value: photoBacklogNoGooglePlaceId },
    { label: "Low Quality Missing", value: photoBacklogLowQuality },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/10 bg-[#0D0708] p-6 shadow-2xl shadow-black/30">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Fix Pictures</p>
        <h2 className="mt-2 text-2xl font-black text-white">Photo Backfill & Repair</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Repair fake image values, migrate existing Google photos into Supabase Storage, and backfill only locations still missing photos.</p>
        <TabProcessBar {...sectionProgress} percent={getRunningProgress({ basePercent: sectionProgress.percent, running: isRunning, progress })} doneLabel={isRunning ? `${progress}% running` : sectionProgress.doneLabel} running={isRunning} />
        <p className="mt-4 rounded-2xl border border-rose-300/15 bg-rose-500/10 p-4 text-xs leading-5 text-rose-100">Picture tools only process records that need repair, migration, or backfill. Already-good Supabase, owner, or admin photos are skipped.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <CompactStat label="Searchable Missing" value={searchableMissingPhotos} tone="attention" />
          {secondaryPhotoStats.map((stat) => (
            <CompactStat key={stat.label} label={stat.label} value={stat.value} />
          ))}
        </div>
        {searchablePhotoCoverageComplete ? (
          <p className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm font-black text-emerald-100">Searchable photo coverage is complete.</p>
        ) : null}
        <p className="mt-4 rounded-2xl border border-white/10 bg-black/30 p-4 text-xs leading-5 text-zinc-300">Searchable Missing counts public/searchable locations with no usable image. Total Photo Backlog includes hidden, low-quality, duplicate, or non-searchable records that do not affect public search results.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <NumberField label="Repair / migration limit" value={photoFixLimit} onChange={setPhotoFixLimit} min={1} max={250} />
          <NumberField label="Backfill limit" value={photoBackfillLimit} onChange={setPhotoBackfillLimit} min={1} max={100} />
        </div>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <ActionMiniCard title="Repair Bad Photo Values" description="Clears placeholder, no-image, missing, default-image, null, and broken values." button="Repair Bad Values" disabled={disabled} running={isRunning} onClick={onRepairBadPlaceholders} />
          <ActionMiniCard title="Migrate Google Photos" description="Copies existing Google Places photo endpoint URLs into Supabase Storage without re-enriching." button="Migrate Google Photos" disabled={disabled} running={isRunning} onClick={onMigrateGooglePhotos} />
          <ActionMiniCard title="Retry Completed Missing Photos" description="Queues completed records that still have no usable photo for another photo attempt." button="Retry Missing Photos" disabled={backfillDisabled} running={isRunning} onClick={onRetryCompletedMissing} />
          <ActionMiniCard title="Backfill Missing Photos" description="Calls Google only for records that still need a photo and saves successful images to location-images." button="Backfill Missing Photos" disabled={backfillDisabled} running={isRunning} onClick={onBackfillMissingPhotos} />
        </div>
        <section className="mt-6 rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-black text-white">Missing Photo Diagnostics</h3>
              <p className="mt-1 text-sm leading-6 text-zinc-400">Load the first 100 missing-photo records with the likely reason each one is still missing an image.</p>
            </div>
            <button type="button" onClick={loadDiagnostics} disabled={diagnosticsLoading} className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300">
              {diagnosticsLoading ? "Diagnosing..." : "Diagnose Missing Photos"}
            </button>
          </div>
          {diagnosticsError ? (
            <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm text-rose-100">{diagnosticsError}</p>
          ) : null}
          {diagnostics ? (
            <div className="mt-5 overflow-hidden rounded-2xl border border-white/10">
              <div className="border-b border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                Showing {diagnostics.totalReturned.toLocaleString()} missing-photo rows
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10 text-left text-sm">
                  <thead className="bg-black/40 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3">Score</th>
                      <th className="px-4 py-3">Searchable</th>
                      <th className="px-4 py-3">Duplicate</th>
                      <th className="px-4 py-3">Enrichment</th>
                      <th className="px-4 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {diagnostics.rows.map((row, index) => {
                      const name = row.name || row.restaurant_name || row.activity_name || "Unnamed";
                      return (
                        <tr key={`${row.id || name}-${index}`} className="text-zinc-300">
                          <td className="max-w-[220px] px-4 py-3 font-semibold text-white">
                            <span className="block truncate">{name}</span>
                            {row.id ? (
                              <button
                                type="button"
                                onClick={() => navigator.clipboard?.writeText(String(row.id))}
                                className="block text-[10px] font-normal text-zinc-600 transition hover:text-zinc-300"
                                title="Copy location ID"
                              >
                                ID: {row.id}
                              </button>
                            ) : null}
                          </td>
                          <td className="px-4 py-3">{row.location_type || "—"}</td>
                          <td className="px-4 py-3">{row.city || "—"}</td>
                          <td className="px-4 py-3">{row.quality_score ?? "—"}</td>
                          <td className="px-4 py-3">{row.is_searchable === true ? "Yes" : "No"}</td>
                          <td className="px-4 py-3">{row.duplicate_status || "—"}</td>
                          <td className="px-4 py-3">{row.enrichment_status || "—"}</td>
                          <td className="min-w-[280px] px-4 py-3 text-zinc-400">{row.reason || "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}

function FixDatabasePanel({ summary, runningAction, progress, cleanupOffset, setCleanupOffset, dbFixLimit, setDbFixLimit, onCleanup, onClassifyChains, onBackfillPhones, onBackfillCuisine }: { summary: GrowthSummary | null; runningAction: string | null; progress: number; cleanupOffset: string; setCleanupOffset: (value: string) => void; dbFixLimit: string; setDbFixLimit: (value: string) => void; onCleanup: () => void; onClassifyChains: () => void; onBackfillPhones: () => void; onBackfillCuisine: () => void; }) {
  const sectionProgress = getDatabaseProgress(summary);
  const isRunning = ["database", "classify-chains", "phones", "cuisine"].includes(String(runningAction));
  const disabled = Boolean(runningAction);
  return <div className="space-y-6"><section className="rounded-[2rem] border border-white/10 bg-[#0D0708] p-6 shadow-2xl shadow-black/30"><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Fix Database</p><h2 className="mt-2 text-2xl font-black text-white">Database Cleanup & Backfills</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Run safe chunked repairs for existing locations without overwriting claimed-owner, CRM, reservation, or manually managed fields.</p><TabProcessBar {...sectionProgress} percent={getRunningProgress({ basePercent: sectionProgress.percent, running: isRunning, progress })} doneLabel={isRunning ? `${progress}% running` : sectionProgress.doneLabel} running={isRunning} /><div className="mt-5 grid gap-3 sm:grid-cols-5"><CompactStat label="Live" value={getNumber(summary?.liveLocations)} /><CompactStat label="Needs Review" value={getNumber(summary?.needsReview)} /><CompactStat label="Duplicates" value={getNumber(summary?.duplicates)} /><CompactStat label="Chains" value={getNumber(summary?.chains)} /><CompactStat label="Utility Chains" value={getNumber(summary?.utilityChains)} /></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><NumberField label="Cleanup limit" value={dbFixLimit} onChange={setDbFixLimit} min={1} max={1000} /><NumberField label="Cleanup offset" value={cleanupOffset} onChange={setCleanupOffset} min={0} /></div><div className="mt-6 grid gap-4 lg:grid-cols-2"><ActionMiniCard title="Clean Existing Locations" description="Normalizes names, addresses, phones, quality scores, and search safety fields." button="Run Cleanup" disabled={disabled} running={runningAction === "database"} onClick={onCleanup} /><ActionMiniCard title="Classify Chains" description="Marks common chains correctly so they do not dominate curated results." button="Classify Chains" disabled={disabled} running={runningAction === "classify-chains"} onClick={onClassifyChains} /><ActionMiniCard title="Backfill Missing Phones" description="Fills missing phone fields where possible without overwriting managed fields." button="Backfill Phones" disabled={disabled} running={runningAction === "phones"} onClick={onBackfillPhones} /><ActionMiniCard title="Backfill Cuisine Names" description="Normalizes restaurant cuisine and category names." button="Backfill Cuisine" disabled={disabled} running={runningAction === "cuisine"} onClick={onBackfillCuisine} /></div></section></div>;
}

function DedupePanel({ summary, runningAction, progress, dedupeScope, setDedupeScope, dedupeBatchId, setDedupeBatchId, dedupeLimit, setDedupeLimit, duplicateBatchId, setDuplicateBatchId, duplicates, onDedupe, onLoadDuplicates, onDecision }: { summary: GrowthSummary | null; runningAction: string | null; progress: number; dedupeScope: string; setDedupeScope: (value: string) => void; dedupeBatchId: string; setDedupeBatchId: (value: string) => void; dedupeLimit: string; setDedupeLimit: (value: string) => void; duplicateBatchId: string; setDuplicateBatchId: (value: string) => void; duplicates: DuplicateMatch[]; onDedupe: () => void; onLoadDuplicates: () => void; onDecision: (match: DuplicateMatch, decision: "duplicate" | "unique" | "reject") => void; }) {
  const sectionProgress = getDedupeProgress(summary);
  const isRunning = runningAction === "dedupe" || runningAction === "duplicates";
  return <div className="space-y-6"><section className="rounded-[2rem] border border-white/10 bg-[#0D0708] p-6 shadow-2xl shadow-black/30"><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Dedupe / Review</p><h2 className="mt-2 text-2xl font-black text-white">Dedupe Staged Imports</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Check staged imports against existing locations and review possible matches before publishing.</p><TabProcessBar {...sectionProgress} percent={getRunningProgress({ basePercent: sectionProgress.percent, running: isRunning, progress })} doneLabel={isRunning ? `${progress}% running` : sectionProgress.doneLabel} running={isRunning} /><div className="mt-5 grid gap-3 sm:grid-cols-4"><CompactStat label="Remaining Dedupe" value={getNumber(summary?.remainingUncheckedDedupe)} /><CompactStat label="Possible Duplicates" value={getNumber(summary?.possibleDuplicates)} /><CompactStat label="Duplicates" value={getNumber(summary?.duplicates)} /><CompactStat label="Rejected" value={getNumber(summary?.rejected)} /></div><div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><SelectField label="Scope" value={dedupeScope} onChange={setDedupeScope} options={[{ label: "All staged records", value: "all" }, { label: "Specific batch", value: "batch" }]} /><NumberField label="Limit" value={dedupeLimit} onChange={setDedupeLimit} min={1} max={500} />{dedupeScope === "batch" ? <TextField label="Batch ID" value={dedupeBatchId} onChange={setDedupeBatchId} placeholder="Paste batch ID" /> : <ReadOnlyField label="Batch ID" value="Not required" />}<button type="button" onClick={onDedupe} disabled={Boolean(runningAction)} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:bg-zinc-700">{runningAction === "dedupe" ? "Running..." : "Run Dedupe Chunk"}</button></div></section><DuplicateReviewPanel batchId={duplicateBatchId} setBatchId={setDuplicateBatchId} matches={duplicates} loading={runningAction === "duplicates"} onLoad={onLoadDuplicates} onDecision={onDecision} /></div>;
}

function PublishPanel({ summary, runningAction, progress, scoreScope, setScoreScope, scoreBatchId, setScoreBatchId, scoreLimit, setScoreLimit, publishScope, setPublishScope, publishBatchId, setPublishBatchId, publishLimit, setPublishLimit, onScore, onPublish }: { summary: GrowthSummary | null; runningAction: string | null; progress: number; scoreScope: string; setScoreScope: (value: string) => void; scoreBatchId: string; setScoreBatchId: (value: string) => void; scoreLimit: string; setScoreLimit: (value: string) => void; publishScope: string; setPublishScope: (value: string) => void; publishBatchId: string; setPublishBatchId: (value: string) => void; publishLimit: string; setPublishLimit: (value: string) => void; onScore: () => void; onPublish: () => void; }) {
  const sectionProgress = getPublishProgress(summary);
  const isRunning = runningAction === "publish" || runningAction === "score";
  return <div className="space-y-6"><section className="rounded-[2rem] border border-white/10 bg-[#0D0708] p-6 shadow-2xl shadow-black/30"><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">Publish</p><h2 className="mt-2 text-2xl font-black text-white">Score & Publish Ready Records</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Score staged records first, then publish only clean, unique, high-quality records into live locations.</p><TabProcessBar {...sectionProgress} percent={getRunningProgress({ basePercent: sectionProgress.percent, running: isRunning, progress })} doneLabel={isRunning ? `${progress}% running` : sectionProgress.doneLabel} running={isRunning} /><div className="mt-5 grid gap-3 sm:grid-cols-4"><CompactStat label="Needs Scoring" value={getNumber(summary?.needsScoring)} /><CompactStat label="Publish Ready" value={getNumber(summary?.publishReady)} /><CompactStat label="Remaining Ready" value={getNumber(summary?.remainingPublishReady ?? summary?.publishReady)} /><CompactStat label="Published" value={getNumber(summary?.latestBatches?.[0]?.total_published)} /></div><div className="mt-6 grid gap-5 lg:grid-cols-2"><section className="rounded-3xl border border-white/10 bg-black/20 p-5"><h3 className="font-black text-white">Score Staged Records</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><SelectField label="Scope" value={scoreScope} onChange={setScoreScope} options={[{ label: "All staged records", value: "all" }, { label: "Specific batch", value: "batch" }]} /><NumberField label="Limit" value={scoreLimit} onChange={setScoreLimit} min={1} max={500} />{scoreScope === "batch" ? <TextField label="Batch ID" value={scoreBatchId} onChange={setScoreBatchId} placeholder="Paste batch ID" /> : <ReadOnlyField label="Batch ID" value="Not required" />}<button type="button" onClick={onScore} disabled={Boolean(runningAction)} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:bg-zinc-700">{runningAction === "score" ? "Scoring..." : "Score Chunk"}</button></div></section><section className="rounded-3xl border border-white/10 bg-black/20 p-5"><h3 className="font-black text-white">Publish Ready Records</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><SelectField label="Scope" value={publishScope} onChange={setPublishScope} options={[{ label: "All publish-ready staged records", value: "all" }, { label: "Specific batch", value: "batch" }]} /><NumberField label="Limit" value={publishLimit} onChange={setPublishLimit} min={1} max={1000} />{publishScope === "batch" ? <TextField label="Batch ID" value={publishBatchId} onChange={setPublishBatchId} placeholder="Paste batch ID" /> : <ReadOnlyField label="Batch ID" value="Not required" />}<button type="button" onClick={onPublish} disabled={Boolean(runningAction)} className="rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:bg-zinc-700">{runningAction === "publish" ? "Publishing..." : "Publish Chunk"}</button></div></section></div></section></div>;
}

function ActionMiniCard({ title, description, button, disabled, running, onClick }: { title: string; description: string; button: string; disabled: boolean; running: boolean; onClick: () => void; }) {
  return <section className="rounded-3xl border border-white/10 bg-black/20 p-5"><h3 className="font-black text-white">{title}</h3><p className="mt-2 text-sm leading-6 text-zinc-400">{description}</p><button type="button" onClick={onClick} disabled={disabled} className="mt-4 rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white transition hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300">{running ? "Running..." : button}</button></section>;
}

function ImportHistoryPanel({
  summary,
  logs,
  loading,
  progress,
  stagedRecords,
  stagingBatchId,
  onCopy,
  onDedupe,
  onPublish,
  onViewStaged,
  onViewDuplicates,
}: {
  summary: GrowthSummary | null;
  logs: ImportLog[];
  loading: boolean;
  progress: number;
  stagedRecords: StagedRecord[];
  stagingBatchId: string;
  onCopy: (batchId: string) => void;
  onDedupe: (batchId: string) => void;
  onPublish: (batchId: string) => void;
  onViewStaged: (batchId: string) => void;
  onViewDuplicates: (batchId: string) => void;
}) {
  const batches = summary?.latestBatches || [];
  const visibleLogs = getVisibleHistoryLogs(logs);
  const historyProgress = getHistoryProgress(visibleLogs);
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <h2 className="text-lg font-bold">Latest Import Batches</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Staged import health, publishing, and review actions. OSM offset is
          app-managed because Overpass does not provide true offset pagination.
        </p>
        <TabProcessBar
          {...historyProgress}
          percent={loading ? Math.max(historyProgress.percent, progress) : historyProgress.percent}
          doneLabel={loading ? `${progress}% loading` : historyProgress.doneLabel}
          running={loading}
        />
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

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
        <h2 className="text-lg font-bold">Recent Import Runs</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Compact run history with technical details collapsed by default.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Utility backfills are hidden from this view to keep Import History focused. Use the technical logs/API logs for detailed utility runs.
        </p>
        {visibleLogs.length === 0 ? (
          <div className="mt-5">
            <EmptyState text="No focused import logs found." />
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {visibleLogs.map((log) => (
              <div
                key={log.id}
                className="rounded-2xl border border-white/10 bg-black/25 p-4"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-black text-white">
                      {log.job_name || "Import run"}
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {log.run_date || log.created_at}
                    </p>
                  </div>
                  <StatusPill status={log.error ? "error" : "success"} />
                </div>

                {log.error ? (
                  <p className="mt-3 rounded-xl border border-rose-300/20 bg-rose-950/30 p-3 text-xs text-rose-100">
                    {log.error}
                  </p>
                ) : null}

                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.2em] text-zinc-500">
                    Details
                  </summary>
                  <pre className="mt-3 max-h-48 overflow-auto rounded-2xl bg-black/30 p-3 text-xs text-zinc-300">
                    {JSON.stringify(log.meta || {}, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
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
  progress,
  onGenerate,
}: {
  summary: GrowthSummary | null;
  limit: string;
  setLimit: (value: string) => void;
  running: boolean;
  progress: number;
  onGenerate: () => void;
}) {
  const qrProgress = getQrProgress(summary);
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
        <TabProcessBar
          {...qrProgress}
          percent={running ? Math.max(qrProgress.percent, progress) : qrProgress.percent}
          doneLabel={running ? `${progress}% running` : qrProgress.doneLabel}
          running={running}
        />
        <p className="mt-4 rounded-2xl border border-rose-300/15 bg-rose-500/10 p-4 text-xs leading-5 text-rose-100">
          QR generation only processes missing QR fields. Existing public QR
          codes, claim QR codes, and claim codes are skipped and never
          overwritten.
        </p>
        {summary?.siteUrlConfigured === false ? (
          <div className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm font-bold text-rose-100">
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
            className="rounded-full border border-rose-300/20 px-6 py-3 text-sm font-black text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
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
  const actionKey = typeof result.actionKey === "string" ? result.actionKey : "";
  const actionLabel =
    typeof result.actionLabel === "string" ? result.actionLabel : "Action";

  const isOsmAction = actionKey === "osm" || actionKey === "osm-test";
  const isScoreAction = actionKey === "score";
  const isClassifyChainsAction = actionKey === "classify-chains";
  const isQrAction = actionKey === "qr";
  const requestedMarketDisplay = result.requested_market_display ?? result.requested_market_original;
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
    "chainsFound",
    "independentFound",
    "remaining",
    "live",
    "staging",
    "publishReady",
    "review",
    "rejected",
    "duplicate",
    "possibleDuplicate",
    "unique",
    "hasMore",
    "scope",
    "updated",
    "generatedClaimCodes",
    "generatedClaimQrs",
    "generatedPublicQrs",
    "skippedAlreadyComplete",
    "failed",
    "searchableMissingPhotosRemaining",
    "totalNonSearchablePhotoBacklog",
    "requested_market",
    "requested_market_resolved",
    "requested_market_display",
    "requested_market_source",
    "market_resolution_confidence",
  ].some((key) => result[key] !== undefined);
  const errorText = typeof result.error === "string" ? result.error : "";
  const isOsmTimeout =
    !ok &&
    (errorText.toLowerCase().includes("timeout") ||
      errorText
        .toLowerCase()
        .includes("all overpass endpoints rejected or timed out"));
  return (
    <div
      className={`mb-6 rounded-3xl border p-5 text-sm ${
        ok
          ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
          : "border-rose-300/25 bg-rose-950/30 text-rose-100"
      }`}
    >
      <p className="font-black">
        {ok ? `${actionLabel} completed` : `${actionLabel} failed`}
      </p>
      {result.error ? <p className="mt-2">{result.error}</p> : null}
      {isOsmTimeout ? (
        <p className="mt-2 font-bold">
          {String(result.categoryGroup) === "parks" ||
          String(result.categoryGroup) === "all"
            ? "That OSM category is large. Try limit 5 or choose a smaller category like bowling, karaoke, dessert, or culture."
            : "Public OSM servers timed out. Try a smaller limit or retry later."}
        </p>
      ) : null}
      {result.batchId && ok ? (
        <p className="mt-2 font-bold">
          Batch created: {String(result.batchId)}
        </p>
      ) : null}
      {ok && typeof result.message === "string" ? (
        <p className="mt-2 font-bold">
          {String(result.message).startsWith("OSM records staged.")
            ? "OSM records staged. Next step: run Score Chunk, then run Dedupe Chunk."
            : result.message}
        </p>
      ) : null}
      {ok && result.searchableMissingPhotosRemaining !== undefined ? (
        <p className="mt-2 font-bold">
          Searchable missing photos remaining: {Number(result.searchableMissingPhotosRemaining).toLocaleString()}
        </p>
      ) : null}
      {ok && result.totalNonSearchablePhotoBacklog !== undefined ? (
        <p className="mt-2 font-bold">
          Total non-searchable photo backlog: {Number(result.totalNonSearchablePhotoBacklog).toLocaleString()}
        </p>
      ) : null}
      {ok && result.hasMore === true ? (
        <p className="mt-2 font-bold">
          {isClassifyChainsAction
            ? "More locations still need chain classification. Run Classify Chains again to continue."
            : isQrAction
              ? "More locations still need QR codes. Run QR Generation again to continue."
              : "More records remain. Run the next chunk."}
        </p>
      ) : null}
      {ok && isClassifyChainsAction && Number(result.remaining || 0) === 0 ? (
        <p className="mt-2 font-bold">
          Chain classification is complete. No unclassified records remain.
        </p>
      ) : null}
      {ok &&
      isOsmAction &&
      result.hasMore === false &&
      Number(result.staged || 0) === 0 ? (
        <p className="mt-2 font-bold">
          No more records found for this OSM category. Reset the cursor or choose another category group.
        </p>
      ) : null}
      {ok && isScoreAction && Number(result.processed || 0) === 0 ? (
        <p className="mt-2 font-bold">
          No staged records need scoring right now. Import more records or switch to a specific batch that still has unchecked records.
        </p>
      ) : null}
      {ok && isScoreAction && Number(result.processed || 0) > 0 ? (
        <p className="mt-2 font-bold">
          Score chunk finished. Next step: run dedupe, then publish ready records.
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
            ["Chains found", result.chainsFound],
            ["Independent", result.independentFound],
            ["Remaining", result.remaining],
            ["Publish ready", result.publishReady],
            ["Review", result.review],
            ["Rejected", result.rejected],
            ["Duplicate", result.duplicate],
            ["Possible duplicate", result.possibleDuplicate],
            ["Unique", result.unique],
            ["Remaining unchecked", result.remainingUnchecked],
            ["Has more", result.hasMore],
            ["Updated", result.updated],
            ["Generated claim codes", result.generatedClaimCodes],
            ["Generated claim QRs", result.generatedClaimQrs],
            ["Generated public QRs", result.generatedPublicQrs],
            ["Skipped complete", result.skippedAlreadyComplete],
            ["Failed", result.failed],
            ["Requested market", result.requested_market_resolved ?? result.requested_market],
            ["Source", requestedMarketDisplay],
            ["Confidence", result.market_resolution_confidence],
            ["Searchable missing photos remaining", result.searchableMissingPhotosRemaining],
            ["Total non-searchable photo backlog", result.totalNonSearchablePhotoBacklog],
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
      <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
        <summary className="cursor-pointer text-xs font-black uppercase tracking-[0.22em] text-zinc-400">
          View technical details
        </summary>
        <pre className="mt-3 max-h-56 overflow-auto rounded-2xl bg-black/30 p-3 text-xs text-zinc-200">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
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

type ProgressTone = "rose" | "zinc";

function getProgressToneClasses(tone: ProgressTone = "rose") {
  if (tone === "zinc") {
    return {
      border: "border-white/10",
      bg: "bg-zinc-300",
      soft: "bg-white/[0.04]",
      text: "text-zinc-100",
      accent: "text-zinc-300",
      ring: "ring-white/10",
      glow: "shadow-black/30",
    };
  }

  return {
    border: "border-rose-300/20",
    bg: "bg-rose-500",
    soft: "bg-rose-500/10",
    text: "text-rose-100",
    accent: "text-rose-300",
    ring: "ring-rose-300/20",
    glow: "shadow-rose-950/30",
  };
}

function TabProcessBar({
  label,
  detail,
  percent,
  doneLabel,
  tone = "rose",
  running = false,
}: {
  label: string;
  detail: string;
  percent: number;
  doneLabel: string;
  tone?: ProgressTone;
  running?: boolean;
}) {
  const safePercent = clampPercent(percent);
  const toneClasses = getProgressToneClasses(tone);

  return (
    <section
      className={`mt-6 overflow-hidden rounded-[1.75rem] border ${toneClasses.border} bg-[#10090A]/90 p-5 shadow-2xl ${toneClasses.glow} ring-1 ${toneClasses.ring}`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${toneClasses.bg} ${
                running ? "animate-pulse" : ""
              }`}
            />
            <p className={`text-sm font-black tracking-tight ${toneClasses.text}`}>
              {label}
            </p>
            {running ? (
              <span className="rounded-full border border-white/10 bg-white/[0.07] px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white">
                Running
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-400">
            {detail}
          </p>
        </div>

        <div className="text-left md:text-right">
          <p className={`text-3xl font-black leading-none ${toneClasses.accent}`}>
            {safePercent}%
          </p>
          <p className="mt-1 text-xs font-bold text-zinc-500">{doneLabel}</p>
        </div>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/[0.08]">
        <div
          className={`relative h-full rounded-full ${toneClasses.bg} transition-all duration-700 ease-out`}
          style={{ width: `${safePercent}%` }}
        >
          {running ? <span className="absolute inset-0 animate-pulse bg-white/25" /> : null}
        </div>
      </div>

      {running ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <ProcessStep active label="Preparing" />
          <ProcessStep active={safePercent >= 35} label="Processing" />
          <ProcessStep active={safePercent >= 75} label="Saving changes" />
        </div>
      ) : null}
    </section>
  );
}

function ProcessStep({ active, label }: { active: boolean; label: string }) {
  return (
    <div
      className={`rounded-2xl border px-3 py-2 text-xs font-black ${
        active
          ? "border-rose-300/20 bg-rose-500/10 text-rose-100"
          : "border-white/10 bg-white/[0.03] text-zinc-500"
      }`}
    >
      {label}
    </div>
  );
}

function QualityPill({ text }: { text: string }) {
  return (
    <span className="rounded-full border border-rose-300/20 bg-rose-500/10 px-3 py-1 text-rose-100">
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
  tone = "default",
}: {
  label: string;
  value: string | number;
  tone?: "default" | "attention";
}) {
  const attention = tone === "attention";
  return (
    <div className={`rounded-2xl border p-4 ${attention ? "border-rose-300/30 bg-rose-500/10" : "border-white/10 bg-black/30"}`}>
      <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${attention ? "text-rose-200" : "text-zinc-500"}`}>
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
      className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-black ${isBad ? "bg-rose-500/10 text-rose-300" : isGood ? "bg-white/10 text-zinc-300" : "bg-white/10 text-zinc-300"}`}
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
