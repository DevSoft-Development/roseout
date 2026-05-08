"use client";

import { useEffect, useMemo, useState } from "react";

type ImportLog = {
  id: string;
  job_name: string;
  run_date: string;
  created_at?: string;
  meta: any;
  error: string | null;
};

function getNumber(value: any) {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function getImported(meta: any) {
  if (meta?.imported !== undefined && meta?.imported !== null) {
    return getNumber(meta.imported);
  }

  return getNumber(meta?.restaurant?.imported) + getNumber(meta?.activity?.imported);
}

function getSkipped(meta: any) {
  if (meta?.skipped !== undefined && meta?.skipped !== null) {
    return getNumber(meta.skipped);
  }

  return getNumber(meta?.restaurant?.skipped) + getNumber(meta?.activity?.skipped);
}

function getFailed(meta: any) {
  if (meta?.failed !== undefined && meta?.failed !== null) {
    return getNumber(meta.failed);
  }

  return getNumber(meta?.restaurant?.failed) + getNumber(meta?.activity?.failed);
}

function getFound(meta: any) {
  return getNumber(
    meta?.total_found_from_google ??
      getNumber(meta?.restaurant?.total_found_from_google) +
        getNumber(meta?.activity?.total_found_from_google)
  );
}

function getRestaurantImported(meta: any) {
  return getNumber(meta?.restaurant?.imported);
}

function getActivityImported(meta: any) {
  return getNumber(meta?.activity?.imported);
}

export default function ImportHistoryPage() {
  const [logs, setLogs] = useState<ImportLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [backfillingPhones, setBackfillingPhones] = useState(false);
  const [progress, setProgress] = useState(0);

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
    fetchLogs();
  }, []);

  useEffect(() => {
    if (!running) {
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
      }
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
          type: "both",
          limit: 2,
          batch: "all",
          areas: "nyc",
          maxQueries: 2,
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
        }`
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
      const failed = getNumber(restaurants.failed) + getNumber(activities.failed);

      alert(
        `Phone backfill complete\nUpdated: ${enriched}\nChecked: ${checked}\nFailed: ${failed}`
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
                  Premium Import Dashboard
                </h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-400">
                  Run balanced Google imports, monitor quality, and track recent
                  restaurant and activity import performance.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <button
                  type="button"
                  onClick={handlePhoneBackfill}
                  disabled={running || backfillingPhones}
                  className="rounded-full border border-rose-400/40 px-7 py-4 text-sm font-black text-rose-100 transition hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:text-zinc-500"
                >
                  {backfillingPhones
                    ? "Backfilling Phones..."
                    : "Backfill Missing Phones"}
                </button>

                <button
                  type="button"
                  onClick={handleRunImport}
                  disabled={running || backfillingPhones}
                  className="rounded-full bg-rose-600 px-7 py-4 text-sm font-black text-white shadow-xl shadow-rose-950/50 transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-300"
                >
                  {running ? "Import Running..." : "Run Google Import"}
                </button>
              </div>
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
                  Filtering restaurants and activities for higher-quality
                  matches.
                </p>
              </div>
            )}
          </div>
        </div>

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
                      <p className="text-xs text-zinc-500">
                        Rank {index + 1}
                      </p>
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

                    {(meta?.type === "both" ||
                      meta?.restaurant ||
                      meta?.activity) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                            Restaurants
                          </p>
                          <p className="mt-2 text-sm text-zinc-300">
                            Imported: {meta.restaurant?.imported ?? 0} ·
                            Skipped: {meta.restaurant?.skipped ?? 0} · Failed:{" "}
                            {meta.restaurant?.failed ?? 0}
                          </p>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                          <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">
                            Activities
                          </p>
                          <p className="mt-2 text-sm text-zinc-300">
                            Imported: {meta.activity?.imported ?? 0} · Skipped:{" "}
                            {meta.activity?.skipped ?? 0} · Failed:{" "}
                            {meta.activity?.failed ?? 0}
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

function StatCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
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