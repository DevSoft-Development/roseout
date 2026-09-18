"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { SearchHealthTrendPoint } from "@/lib/admin/search-health-dashboard";

type Granularity = "hourly" | "daily";

type TrendResponse = {
  data?: SearchHealthTrendPoint[];
  granularity?: Granularity;
  lastEventAt?: string | null;
  error?: string;
};

function buildPoints(values: number[], width: number, height: number, max: number) {
  if (values.length === 0) return "";
  const xStep = values.length === 1 ? 0 : width / (values.length - 1);
  return values
    .map((value, index) => {
      const x = index * xStep;
      const y = height - (value / Math.max(1, max)) * height;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function areaPoints(line: string, width: number, height: number) {
  return line ? `0,${height} ${line} ${width},${height}` : "";
}

function labelFor(point: SearchHealthTrendPoint, granularity: Granularity) {
  if (granularity === "hourly") {
    return new Date(point.date).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return new Date(`${point.date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function relativeTime(value: string | null) {
  if (!value) return "No events recorded";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function SearchHealthTrendChart({
  data: initialData,
  error: initialError,
}: {
  data: SearchHealthTrendPoint[];
  error?: string;
}) {
  const [data, setData] = useState(initialData);
  const [granularity, setGranularity] = useState<Granularity>("daily");
  const [lastEventAt, setLastEventAt] = useState<string | null>(null);
  const [error, setError] = useState(initialError ?? "");
  const [loading, setLoading] = useState(false);

  const loadTrend = useCallback(async (nextGranularity: Granularity) => {
    setLoading(true);
    try {
      const current = new URL(window.location.href);
      const params = new URLSearchParams();
      params.set("range", current.searchParams.get("range") ?? "30d");
      params.set("granularity", nextGranularity);
      const source = current.searchParams.get("source");
      const from = current.searchParams.get("from");
      const to = current.searchParams.get("to");
      if (source) params.set("source", source);
      if (from) params.set("from", from);
      if (to) params.set("to", to);

      const response = await fetch(`/api/admin/search-health/trend?${params.toString()}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as TrendResponse;
      if (!response.ok) throw new Error(payload.error ?? "Trend data could not be loaded.");

      setData(payload.data ?? []);
      setLastEventAt(payload.lastEventAt ?? null);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Trend data could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const current = new URL(window.location.href);
    const initialGranularity: Granularity =
      (current.searchParams.get("range") ?? "30d") === "24h" ? "hourly" : "daily";
    setGranularity(initialGranularity);
    void loadTrend(initialGranularity);

    const timer = window.setInterval(() => void loadTrend(initialGranularity), 30_000);
    return () => window.clearInterval(timer);
  }, [loadTrend]);

  const width = 760;
  const height = 250;
  const healthy = data.map((point) => point.healthy);
  const issues = data.map((point) => point.issues);
  const max = Math.max(1, ...healthy, ...issues);
  const healthyLine = buildPoints(healthy, width, height, max);
  const issueLine = buildPoints(issues, width, height, max);
  const labels = useMemo(
    () =>
      data.length <= 6
        ? data
        : data.filter(
            (_, index) =>
              index === 0 ||
              index === data.length - 1 ||
              index % Math.max(1, Math.floor(data.length / 5)) === 0,
          ),
    [data],
  );
  const stale = lastEventAt ? Date.now() - Date.parse(lastEventAt) > 60 * 60 * 1000 : false;

  function changeGranularity(next: Granularity) {
    setGranularity(next);
    void loadTrend(next);
  }

  return (
    <section className="h-full rounded-2xl border border-white/10 bg-[#100d0c] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/65">
            Search quality over time
          </p>
          <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/55">
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Healthy searches
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Issue searches
            </span>
          </div>
          <p className="mt-2 text-xs text-white/40">
            Last production event: {relativeTime(lastEventAt)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(["hourly", "daily"] as const).map((mode) => (
            <button
              className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${
                granularity === mode
                  ? "border-rose-400/50 bg-rose-500/15 text-rose-100"
                  : "border-white/10 bg-black/20 text-white/55 hover:text-white"
              }`}
              key={mode}
              onClick={() => changeGranularity(mode)}
              type="button"
            >
              {mode === "hourly" ? "Hourly" : "Daily"}
            </button>
          ))}
          <button
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-white/60 hover:text-white disabled:opacity-50"
            disabled={loading}
            onClick={() => void loadTrend(granularity)}
            type="button"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {stale ? (
        <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          No production search events have been recorded in the last 60 minutes.
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-xl border border-red-400/20 bg-red-500/10 p-4 text-sm text-red-100">
          Trend data could not be loaded: {error}
        </div>
      ) : data.length === 0 ? (
        <div className="mt-5 flex h-[290px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-white/40">
          No production search trend data matches the current date and source filters.
        </div>
      ) : (
        <>
          <div className="mt-5 overflow-hidden">
            <svg
              aria-label={`${granularity} healthy and issue search totals`}
              className="h-[280px] w-full"
              role="img"
              viewBox={`-42 -18 ${width + 58} ${height + 54}`}
            >
              <defs>
                <linearGradient id="healthy-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgb(16 185 129)" stopOpacity="0.34" />
                  <stop offset="100%" stopColor="rgb(16 185 129)" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="issue-fill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="rgb(239 68 68)" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="rgb(239 68 68)" stopOpacity="0.01" />
                </linearGradient>
              </defs>

              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = height - ratio * height;
                return (
                  <g key={ratio}>
                    <line stroke="rgba(255,255,255,0.09)" strokeDasharray="4 4" x1="0" x2={width} y1={y} y2={y} />
                    <text fill="rgba(255,255,255,0.38)" fontSize="11" textAnchor="end" x="-10" y={y + 4}>
                      {Math.round(max * ratio)}
                    </text>
                  </g>
                );
              })}

              <polygon fill="url(#healthy-fill)" points={areaPoints(healthyLine, width, height)} />
              <polygon fill="url(#issue-fill)" points={areaPoints(issueLine, width, height)} />
              <polyline fill="none" points={healthyLine} stroke="rgb(16 185 129)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
              <polyline fill="none" points={issueLine} stroke="rgb(239 68 68)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />

              {labels.map((point) => {
                const index = data.indexOf(point);
                const x = data.length === 1 ? 0 : (index / (data.length - 1)) * width;
                return (
                  <text
                    fill="rgba(255,255,255,0.4)"
                    fontSize="10"
                    key={point.date}
                    textAnchor={index === 0 ? "start" : index === data.length - 1 ? "end" : "middle"}
                    x={x}
                    y={height + 25}
                  >
                    {labelFor(point, granularity)}
                  </text>
                );
              })}
            </svg>
          </div>

          <p className="mt-1 text-xs text-white/35">
            Showing {data.length.toLocaleString("en-US")} {granularity} data points from production search events. Auto-refreshes every 30 seconds.
          </p>
        </>
      )}
    </section>
  );
}
