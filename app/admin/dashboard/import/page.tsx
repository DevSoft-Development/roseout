"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type ReservationBackfillFailure = {
  id?: string | number | null;
  name?: string | null;
  google_place_id?: string | null;
  status?: number;
  error?: string;
};

type ReservationBackfillResult = {
  success?: boolean;
  error?: string;
  details?: string;
  step?: string;
  checked?: number;
  updated?: number;
  foundFromGoogle?: number;
  foundFromProviderSearch?: number;
  foundFromWebsite?: number;
  notFound?: number;
  skippedNoWebsite?: number;
  blocked?: number;
  nextOffset?: number;
  skippedAlreadyHasLink?: number;
  skippedNoGooglePlaceId?: number;
  skippedInvalidPlaceId?: number;
  skippedNoBookingLink?: number;
  refreshedPlaceIds?: number;
  failed?: number;
  failures?: ReservationBackfillFailure[];
  dryRun?: boolean;
};

function isReservationBackfillResult(
  value: unknown,
): value is ReservationBackfillResult {
  return typeof value === "object" && value !== null;
}

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

function getRestaurantImported(meta: ImportMeta) {
  return getNumber(meta?.restaurant?.imported);
}

function getActivityImported(meta: ImportMeta) {
  return getNumber(meta?.activity?.imported);
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

const reservationBackfillTableOptions = [
  { label: "Locations", value: "locations" },
  { label: "Restaurants", value: "restaurants" },
  { label: "Activities", value: "activities" },
  { label: "All", value: "all" },
];

const queryCountOptions = [
  { label: "1 query", value: "1" },
  { label: "2 queries", value: "2" },
  { label: "3 queries", value: "3" },
  { label: "5 queries", value: "5" },
  { label: "8 queries", value: "8" },
  { label: "12 queries", value: "12" },
];

export default function ImportPage() {
  useEffect(() => {
    document.title = "Import | TheOutHaven Admin";
  }, []);
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [backfillingPhones, setBackfillingPhones] = useState(false);
  const [backfillingCuisines, setBackfillingCuisines] = useState(false);
  const [cleaningLocations, setCleaningLocations] = useState(false);
  const [backfillingReservations, setBackfillingReservations] = useState(false);
  const [reservationBackfillTable, setReservationBackfillTable] =
    useState("locations");
  const [reservationBackfillLimit, setReservationBackfillLimit] =
    useState("25");
  const [reservationBackfillOffset, setReservationBackfillOffset] =
    useState("0");
  const [reservationBackfillDryRun, setReservationBackfillDryRun] =
    useState(true);
  const [
    reservationIncludeProviderSearch,
    setReservationIncludeProviderSearch,
  ] = useState(true);
  const [
    reservationIncludeWebsiteDiscovery,
    setReservationIncludeWebsiteDiscovery,
  ] = useState(false);
  const [reservationOnlyMissing, setReservationOnlyMissing] = useState(true);
  const [reservationBackfillResult, setReservationBackfillResult] =
    useState<ReservationBackfillResult | null>(null);
  const [reservationContinuousRunning, setReservationContinuousRunning] =
    useState(false);
  const reservationStopRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [importType, setImportType] = useState("both");
  const [area, setArea] = useState("nyc");
  const [primaryTag, setPrimaryTag] = useState("all");
  const [minRating, setMinRating] = useState("4");
  const [queryCount, setQueryCount] = useState("2");

  useEffect(() => {
    const savedOffset = window.localStorage.getItem(
      "reservationDiscoveryOffset",
    );
    if (savedOffset) {
      // The offset is a local operator preference and should hydrate only in the browser.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReservationBackfillOffset(savedOffset);
    }
  }, []);

  const fetchLogs = async () => {
    try {
      setLoading(true);

      const res = await fetch("/api/admin/import-logs", {
        cache: "no-store",
      });

      const data = await res.json();

      setLogs(data.logs || []);
    } catch (err) {
      console.error("Failed to fetch import logs:", err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initial data load is intentionally kicked off once when the client page mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!running) {
      // Progress is visual-only and should reset as soon as the import stops.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProgress(0);
      return;
    }

    setProgress(12);

    const timer = window.setInterval(() => {
      setProgress((prev) => {
        if (prev >= 92) return prev;
        return prev + Math.floor(Math.random() * 8) + 3;
      });
    }, 700);

    return () => window.clearInterval(timer);
  }, [running]);

  const totals = useMemo(() => {
    return logs.reduce(
      (acc, log) => {
        const meta = log.meta || {};

        acc.imported += getImported(meta);
        acc.skipped += getSkipped(meta);
        acc.failed += getFailed(meta);
        acc.found += getFound(meta);
        acc.restaurants += getRestaurantImported(meta);
        acc.activities += getActivityImported(meta);

        if (log.error) acc.errors += 1;

        return acc;
      },
      {
        imported: 0,
        skipped: 0,
        failed: 0,
        found: 0,
        restaurants: 0,
        activities: 0,
        errors: 0,
      },
    );
  }, [logs]);

  const lastLog = logs[0];

  const successRate = useMemo(() => {
    const total = totals.imported + totals.skipped + totals.failed;
    if (!total) return 0;
    return Math.round(((totals.imported + totals.skipped) / total) * 100);
  }, [totals]);

  const topAreas = useMemo(() => {
    const map = new Map<string, number>();

    logs.forEach((log) => {
      const meta = log.meta || {};

      const queries = [
        ...(meta.queries_used || []),
        ...(meta.restaurant?.queries_used || []),
        ...(meta.activity?.queries_used || []),
      ];

      queries.forEach((query: string) => {
        const match = String(query).match(/\bin\s+(.+)$/i);
        const area = match?.[1]?.trim();

        if (area) {
          map.set(area, (map.get(area) || 0) + 1);
        }
      });
    });

    return Array.from(map.entries())
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [logs]);

  const breakdown = useMemo(() => {
    const max = Math.max(totals.imported, totals.skipped, totals.failed, 1);

    return [
      {
        label: "Imported",
        value: totals.imported,
        width: `${(totals.imported / max) * 100}%`,
      },
      {
        label: "Skipped",
        value: totals.skipped,
        width: `${(totals.skipped / max) * 100}%`,
      },
      {
        label: "Failed",
        value: totals.failed,
        width: `${(totals.failed / max) * 100}%`,
      },
    ];
  }, [totals]);

  const handleRunImport = async () => {
    try {
      setRunning(true);
      setProgress(15);

      const res = await fetch("/api/admin/run-google-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
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
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Google import failed");
        return;
      }

      setProgress(100);

      const errors = Array.isArray(data.errors)
        ? data.errors.slice(0, 3).join("\n")
        : "";

      alert(
        `Imported: ${data.imported || 0}\nSkipped: ${
          data.skipped || 0
        }\nFailed: ${data.failed || 0}${
          errors ? `\n\nFirst errors:\n${errors}` : ""
        }`,
      );

      await fetchLogs();
    } catch (err) {
      console.error("Run import failed:", err);
      alert("Google import failed");
    } finally {
      window.setTimeout(() => {
        setRunning(false);
        setProgress(0);
      }, 600);
    }
  };

  const handleCuisineBackfill = async () => {
    try {
      setBackfillingCuisines(true);

      const res = await fetch("/api/admin/restaurants/backfill-cuisine", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          includeGeneric: true,
          limit: 250,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Cuisine backfill failed");
        return;
      }

      alert(
        `Cuisine backfill complete\nChecked: ${data.checked || 0}\nUpdated: ${data.updated || 0}\nSkipped: ${data.skipped || 0}`,
      );

      await fetchLogs();
    } catch (err) {
      console.error("Cuisine backfill failed:", err);
      alert("Cuisine backfill failed");
    } finally {
      setBackfillingCuisines(false);
    }
  };

  const handleLocationCleanup = async () => {
    try {
      setCleaningLocations(true);

      const res = await fetch("/api/admin/locations/cleanup-missing-address", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          limit: 100,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Location cleanup failed");
        return;
      }

      const restaurants = data.restaurants || {};
      const activities = data.activities || {};

      alert(
        `Location cleanup complete\nRestaurants updated: ${restaurants.updated || 0}\nActivities updated: ${activities.updated || 0}\nFailed: ${(restaurants.failed || 0) + (activities.failed || 0)}`,
      );

      await fetchLogs();
    } catch (err) {
      console.error("Location cleanup failed:", err);
      alert("Location cleanup failed");
    } finally {
      setCleaningLocations(false);
    }
  };

  const runReservationDiscoveryBatch = async (offsetOverride?: number) => {
    const safeLimit = Math.max(
      1,
      Math.min(Number(reservationBackfillLimit || 25), 50),
    );
    const currentOffset = Math.max(
      0,
      Number(offsetOverride ?? reservationBackfillOffset) || 0,
    );

    const params = new URLSearchParams({
      table: reservationBackfillTable,
      limit: String(safeLimit),
      offset: String(currentOffset),
      dryRun: String(reservationBackfillDryRun),
      includeProviderSearch: String(reservationIncludeProviderSearch),
      includeWebsiteDiscovery: String(reservationIncludeWebsiteDiscovery),
      onlyMissing: String(reservationOnlyMissing),
    });

    const res = await fetch(
      `/api/admin/backfill-reservation-links?${params.toString()}`,
      {
        cache: "no-store",
      },
    );
    const data = (await res.json()) as ReservationBackfillResult;

    setReservationBackfillResult(data);

    if (!res.ok || data.success === false) {
      alert(
        [
          data.error || "Reservation link discovery failed",
          data.details ? `Details: ${data.details}` : null,
          data.step ? `Step: ${data.step}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
      );
      throw new Error(
        data.details || data.error || "Reservation link discovery failed",
      );
    }

    const nextOffset = getNumber(data.nextOffset ?? currentOffset + safeLimit);
    setReservationBackfillOffset(String(nextOffset));
    window.localStorage.setItem(
      "reservationDiscoveryOffset",
      String(nextOffset),
    );

    return data;
  };

  const handleReservationBackfill = async () => {
    try {
      setBackfillingReservations(true);
      setReservationBackfillResult(null);
      await runReservationDiscoveryBatch();
      await fetchLogs();
    } catch (err) {
      console.error("Reservation discovery failed:", err);
    } finally {
      setBackfillingReservations(false);
    }
  };

  const handleReservationNextBatch = async () => {
    try {
      setBackfillingReservations(true);
      await runReservationDiscoveryBatch(
        getNumber(
          reservationBackfillResult?.nextOffset ?? reservationBackfillOffset,
        ),
      );
      await fetchLogs();
    } catch (err) {
      console.error("Reservation discovery next batch failed:", err);
    } finally {
      setBackfillingReservations(false);
    }
  };

  const handleReservationContinuous = async () => {
    reservationStopRef.current = false;
    setReservationContinuousRunning(true);
    setBackfillingReservations(true);

    try {
      let currentOffset = Math.max(0, Number(reservationBackfillOffset) || 0);

      while (!reservationStopRef.current) {
        const data = await runReservationDiscoveryBatch(currentOffset);
        if (
          getNumber(data.checked) === 0 ||
          getNumber(data.blocked) > 10 ||
          getNumber(data.failed) > 10
        )
          break;

        currentOffset = getNumber(
          data.nextOffset ??
            currentOffset + Number(reservationBackfillLimit || 25),
        );
        await new Promise((resolve) => window.setTimeout(resolve, 1500));
      }

      await fetchLogs();
    } catch (err) {
      console.error("Reservation discovery continuous run failed:", err);
    } finally {
      reservationStopRef.current = false;
      setReservationContinuousRunning(false);
      setBackfillingReservations(false);
    }
  };

  const handleReservationStop = () => {
    reservationStopRef.current = true;
    setReservationContinuousRunning(false);
  };

  const handlePhoneBackfill = async () => {
    try {
      setBackfillingPhones(true);

      const res = await fetch("/api/admin/backfill-review-counts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fields: ["phone"],
          limit: 50,
          minRating: 0,
          minReviews: 0,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || "Phone backfill failed");
        return;
      }

      const restaurants = data.restaurants || {};
      const activities = data.activities || {};
      const enriched =
        getNumber(restaurants.enriched) + getNumber(activities.enriched);
      const checked =
        getNumber(restaurants.checked) + getNumber(activities.checked);
      const failed =
        getNumber(restaurants.failed) + getNumber(activities.failed);

      alert(
        `Phone backfill complete\nUpdated: ${enriched}\nChecked: ${checked}\nFailed: ${failed}`,
      );

      await fetchLogs();
    } catch (err) {
      console.error("Phone backfill failed:", err);
      alert("Phone backfill failed");
    } finally {
      setBackfillingPhones(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#090506] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.035] shadow-2xl shadow-black/40">
          <div className="relative p-6 sm:p-8">
            <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-600/20 blur-3xl" />
            <div className="absolute bottom-0 left-0 h-40 w-40 rounded-full bg-red-900/20 blur-3xl" />

            <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="mb-3 text-xs font-semibold uppercase tracking-[0.35em] text-rose-300">
                  TheOutHaven Admin
                </p>
                <h1 className="text-3xl font-black tracking-tight sm:text-4xl">
                  Import
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  Run targeted Google imports from inside the admin dashboard.
                  Every imported location must include a photo, phone number,
                  website, type, and usable location data.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap lg:justify-end">
                <button
                  type="button"
                  onClick={handlePhoneBackfill}
                  disabled={
                    running ||
                    backfillingPhones ||
                    backfillingCuisines ||
                    cleaningLocations ||
                    backfillingReservations
                  }
                  className="rounded-full border border-rose-400/40 px-7 py-4 text-sm font-black text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
                >
                  {backfillingPhones
                    ? "Backfilling Phones..."
                    : "Backfill Missing Phones"}
                </button>

                <button
                  type="button"
                  onClick={handleCuisineBackfill}
                  disabled={
                    running ||
                    backfillingPhones ||
                    backfillingCuisines ||
                    cleaningLocations ||
                    backfillingReservations
                  }
                  className="rounded-full border border-rose-300/40 px-7 py-4 text-sm font-black text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
                >
                  {backfillingCuisines
                    ? "Backfilling Cuisines..."
                    : "Backfill Cuisine Names"}
                </button>

                <button
                  type="button"
                  onClick={handleLocationCleanup}
                  disabled={
                    running ||
                    backfillingPhones ||
                    backfillingCuisines ||
                    cleaningLocations ||
                    backfillingReservations
                  }
                  className="rounded-full border border-sky-300/40 px-7 py-4 text-sm font-black text-sky-100 transition hover:-translate-y-0.5 hover:border-sky-200 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
                >
                  {cleaningLocations
                    ? "Cleaning Locations..."
                    : "Clean Missing City/State/Zip"}
                </button>

                <button
                  type="button"
                  onClick={handleRunImport}
                  disabled={
                    running ||
                    backfillingPhones ||
                    backfillingCuisines ||
                    cleaningLocations ||
                    backfillingReservations
                  }
                  className="rounded-full bg-rose-600 px-7 py-4 text-sm font-black text-white shadow-xl shadow-rose-950/50 transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
                >
                  {running ? "Import Running..." : "Run Google Import"}
                </button>
              </div>
            </div>

            <div className="relative mt-8 grid gap-4 rounded-[1.5rem] border border-white/10 bg-black/30 p-4 md:grid-cols-2 xl:grid-cols-5">
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

            <div className="relative mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-300">
              <QualityPill text="1 picture required" />
              <QualityPill text="Phone required" />
              <QualityPill text="Website required" />
              <QualityPill text="Cuisine/activity type required" />
              <QualityPill text="Location required" />
            </div>

            {running && (
              <div className="relative mt-8 rounded-2xl border border-rose-400/20 bg-black/40 p-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="font-semibold text-rose-100">
                    Import in progress
                  </span>
                  <span className="font-bold text-rose-300">{progress}%</span>
                </div>

                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-rose-500 transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>

                <p className="mt-3 text-xs text-zinc-500">
                  Filtering for your selected type, area, tag, rating, query
                  count, and required contact/photo/location fields.
                </p>
              </div>
            )}
          </div>
        </div>

        <section className="mb-6 rounded-[2rem] border border-rose-300/15 bg-white/[0.035] p-6 shadow-2xl shadow-black/30">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
                Reservation Link Discovery
              </p>
              <h2 className="mt-2 text-2xl font-black">
                Reservation Link Discovery
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
                Find external reservation links for imported locations using
                Google Places, provider search, and lightweight website
                discovery. Use batches of 25–50 only—do not run all locations at
                once.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handleReservationBackfill}
                disabled={
                  running ||
                  backfillingPhones ||
                  backfillingCuisines ||
                  cleaningLocations ||
                  backfillingReservations
                }
                className="rounded-full bg-white px-6 py-3 text-sm font-black text-black shadow-xl transition hover:-translate-y-0.5 hover:bg-rose-100 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
              >
                {backfillingReservations && !reservationContinuousRunning
                  ? "Running..."
                  : "Run Batch"}
              </button>
              <button
                type="button"
                onClick={handleReservationNextBatch}
                disabled={
                  running ||
                  backfillingPhones ||
                  backfillingCuisines ||
                  cleaningLocations ||
                  backfillingReservations
                }
                className="rounded-full border border-white/15 px-6 py-3 text-sm font-black text-white transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-white/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
              >
                Run Next Batch
              </button>
              <button
                type="button"
                onClick={handleReservationContinuous}
                disabled={
                  running ||
                  backfillingPhones ||
                  backfillingCuisines ||
                  cleaningLocations ||
                  backfillingReservations
                }
                className="rounded-full border border-emerald-300/40 px-6 py-3 text-sm font-black text-emerald-100 transition hover:-translate-y-0.5 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
              >
                Run Continuous
              </button>
              <button
                type="button"
                onClick={handleReservationStop}
                disabled={!reservationContinuousRunning}
                className="rounded-full border border-red-300/40 px-6 py-3 text-sm font-black text-red-100 transition hover:-translate-y-0.5 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
              >
                Stop
              </button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <SelectField
              label="Table"
              value={reservationBackfillTable}
              onChange={setReservationBackfillTable}
              options={reservationBackfillTableOptions}
            />
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
                Limit
              </span>
              <input
                type="number"
                min="1"
                max="50"
                value={reservationBackfillLimit}
                onChange={(event) =>
                  setReservationBackfillLimit(event.target.value)
                }
                className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 text-sm font-black text-white outline-none transition focus:border-rose-400"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
                Offset
              </span>
              <input
                type="number"
                min="0"
                value={reservationBackfillOffset}
                onChange={(event) =>
                  setReservationBackfillOffset(event.target.value)
                }
                className="w-full rounded-2xl border border-white/10 bg-[#14090d] px-4 py-3 text-sm font-black text-white outline-none transition focus:border-rose-400"
              />
            </label>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4 text-sm font-bold text-zinc-300">
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-zinc-500">
                Current offset
              </p>
              <p className="mt-2 text-2xl font-black text-white">
                {getNumber(reservationBackfillOffset).toLocaleString()}
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <ToggleField
              label="Dry run"
              checked={reservationBackfillDryRun}
              onChange={setReservationBackfillDryRun}
            />
            <ToggleField
              label="Provider search"
              checked={reservationIncludeProviderSearch}
              onChange={setReservationIncludeProviderSearch}
            />
            <ToggleField
              label="Website discovery"
              checked={reservationIncludeWebsiteDiscovery}
              onChange={setReservationIncludeWebsiteDiscovery}
            />
            <ToggleField
              label="Only missing"
              checked={reservationOnlyMissing}
              onChange={setReservationOnlyMissing}
            />
          </div>

          {reservationContinuousRunning ? (
            <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">
              Continuous mode is running one batch every 1.5 seconds. It will
              stop on checked = 0, blocked &gt; 10, failed &gt; 10, or when Stop
              is clicked.
            </div>
          ) : null}

          {reservationBackfillResult &&
          isReservationBackfillResult(reservationBackfillResult) ? (
            <div className="mt-5 space-y-4 rounded-2xl border border-white/10 bg-black/40 p-4 text-sm text-zinc-200">
              {reservationBackfillResult.success === false ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-100">
                  <p className="font-black">
                    {reservationBackfillResult.error ||
                      "Reservation link discovery failed"}
                  </p>
                  {reservationBackfillResult.details ? (
                    <p className="mt-2 text-xs text-red-100/80">
                      Details: {reservationBackfillResult.details}
                    </p>
                  ) : null}
                  {reservationBackfillResult.step ? (
                    <p className="mt-1 text-xs text-red-100/80">
                      Step: {reservationBackfillResult.step}
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <MiniStat
                  label="Current offset"
                  value={getNumber(reservationBackfillOffset)}
                />
                <MiniStat
                  label="Checked"
                  value={getNumber(reservationBackfillResult.checked)}
                />
                <MiniStat
                  label="Updated"
                  value={getNumber(reservationBackfillResult.updated)}
                />
                <MiniStat
                  label="Found from Google"
                  value={getNumber(reservationBackfillResult.foundFromGoogle)}
                />
                <MiniStat
                  label="Found from provider search"
                  value={getNumber(
                    reservationBackfillResult.foundFromProviderSearch,
                  )}
                />
                <MiniStat
                  label="Found from website"
                  value={getNumber(reservationBackfillResult.foundFromWebsite)}
                />
                <MiniStat
                  label="No link found"
                  value={getNumber(reservationBackfillResult.notFound)}
                />
                <MiniStat
                  label="Skipped no website"
                  value={getNumber(reservationBackfillResult.skippedNoWebsite)}
                />
                <MiniStat
                  label="Blocked"
                  value={getNumber(reservationBackfillResult.blocked)}
                />
                <MiniStat
                  label="Failed"
                  value={getNumber(reservationBackfillResult.failed)}
                />
                <MiniStat
                  label="Next offset"
                  value={getNumber(reservationBackfillResult.nextOffset)}
                />
              </div>

              {reservationBackfillResult.failures?.length ? (
                <div className="rounded-xl border border-rose-400/20 bg-rose-500/10 p-4">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">
                    First 10 failures
                  </p>
                  <div className="mt-3 space-y-2">
                    {reservationBackfillResult.failures
                      .slice(0, 10)
                      .map((failure, index) => (
                        <div
                          key={`${failure.id || "failure"}-${index}`}
                          className="rounded-lg bg-black/25 p-3 text-xs text-rose-50/90"
                        >
                          <p className="font-bold">
                            {failure.name || "Unnamed row"}
                          </p>
                          <p>ID: {failure.id ?? "unknown"}</p>
                          {failure.google_place_id ? (
                            <p>Google Place ID: {failure.google_place_id}</p>
                          ) : null}
                          {failure.status ? (
                            <p>Status: {failure.status}</p>
                          ) : null}
                          <p>Error: {failure.error || "Unknown error"}</p>
                        </div>
                      ))}
                  </div>
                </div>
              ) : null}

              <pre className="max-h-96 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 text-xs leading-5 text-emerald-100">
                {JSON.stringify(reservationBackfillResult, null, 2)}
              </pre>
            </div>
          ) : null}
        </section>

        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          <StatCard label="Total Imported" value={totals.imported} />
          <StatCard label="Restaurants" value={totals.restaurants} />
          <StatCard label="Activities" value={totals.activities} />
          <StatCard label="Total Found" value={totals.found} />
          <StatCard label="Skipped" value={totals.skipped} />
          <StatCard label="Success Rate" value={`${successRate}%`} />
        </div>

        <div className="mb-6 grid gap-6 lg:grid-cols-3">
          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 lg:col-span-2">
            <h2 className="text-lg font-bold">Import Breakdown</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Overview across recent import logs.
            </p>

            <div className="mt-6 space-y-5">
              {breakdown.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="font-semibold text-zinc-300">
                      {item.label}
                    </span>
                    <span className="font-bold">{item.value}</span>
                  </div>

                  <div className="h-3 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-rose-500 transition-all duration-700"
                      style={{ width: item.width }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6">
            <h2 className="text-lg font-bold">Top Areas Imported</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Based on recent query history.
            </p>

            <div className="mt-5 space-y-3">
              {topAreas.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-black/30 p-5 text-sm text-zinc-500">
                  No area insights yet.
                </div>
              ) : (
                topAreas.map((item, index) => (
                  <div
                    key={item.area}
                    className="flex items-center justify-between rounded-2xl bg-black/30 p-4"
                  >
                    <div>
                      <p className="font-bold">{item.area}</p>
                      <p className="text-xs text-zinc-500">Rank {index + 1}</p>
                    </div>
                    <span className="rounded-full bg-rose-500/10 px-3 py-1 text-xs font-bold text-rose-300">
                      {item.count}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-bold">Recent Import Logs</h2>
              <p className="mt-1 text-sm text-zinc-500">
                Latest run: {lastLog?.run_date || "No runs yet"}
              </p>
            </div>

            <button
              type="button"
              onClick={fetchLogs}
              disabled={loading}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-bold text-zinc-300 transition hover:border-rose-400 hover:text-white disabled:opacity-50"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {loading && logs.length === 0 ? (
            <EmptyState text="Loading import logs..." />
          ) : logs.length === 0 ? (
            <EmptyState text="No import history yet." />
          ) : (
            <div className="space-y-4">
              {logs.map((log) => {
                const meta = log.meta || {};

                return (
                  <div
                    key={log.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-5"
                  >
                    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">
                          {log.job_name || "Google Import"}
                        </p>
                        <p className="text-sm text-zinc-500">
                          {log.run_date || log.created_at}
                        </p>
                      </div>

                      <span
                        className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${
                          log.error
                            ? "bg-red-500/10 text-red-300"
                            : "bg-emerald-500/10 text-emerald-300"
                        }`}
                      >
                        {log.error ? "Error" : "Success"}
                      </span>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <MiniStat label="Imported" value={getImported(meta)} />
                      <MiniStat label="Skipped" value={getSkipped(meta)} />
                      <MiniStat label="Failed" value={getFailed(meta)} />
                      <MiniStat label="Found" value={getFound(meta)} />
                    </div>

                    {meta?.settings && (
                      <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-zinc-400">
                        <span className="rounded-full bg-white/10 px-3 py-1">
                          Type:{" "}
                          {meta.settings.type === "both"
                            ? "all"
                            : meta.settings.type}
                        </span>
                        <span className="rounded-full bg-white/10 px-3 py-1">
                          Rating: {meta.settings.minRating || 4}+
                        </span>
                        <span className="rounded-full bg-white/10 px-3 py-1">
                          Tag:{" "}
                          {meta.settings.primaryTag ||
                            meta.settings.batch ||
                            "all"}
                        </span>
                        <span className="rounded-full bg-white/10 px-3 py-1">
                          Queries: {meta.settings.maxQueries || 2}
                        </span>
                      </div>
                    )}

                    {(meta?.type === "both" ||
                      meta?.restaurant ||
                      meta?.activity) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                            Restaurants
                          </p>
                          <p className="mt-2 text-sm text-zinc-300">
                            Imported: {getNumber(meta.restaurant?.imported)} ·
                            Skipped: {getNumber(meta.restaurant?.skipped)} ·
                            Failed: {getNumber(meta.restaurant?.failed)}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                            Activities
                          </p>
                          <p className="mt-2 text-sm text-zinc-300">
                            Imported: {getNumber(meta.activity?.imported)} ·
                            Skipped: {getNumber(meta.activity?.skipped)} ·
                            Failed: {getNumber(meta.activity?.failed)}
                          </p>
                        </div>
                      </div>
                    )}

                    {log.error && (
                      <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-200">
                        {log.error}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
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

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm font-black text-white">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 accent-rose-600"
      />
    </label>
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
      <p className="mt-3 text-3xl font-black">{value}</p>
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

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-8 text-center text-sm text-zinc-400">
      {text}
    </div>
  );
}
