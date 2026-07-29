"use client";

import { useState } from "react";
import type { SearchProfileMode } from "@/lib/search/v2/retrieval/searchProfileMode";
import type { SearchProfileRolloutConfig } from "@/lib/search/v2/retrieval/searchProfileRolloutConfig";

const modes: Array<[SearchProfileMode, string, string]> = [
  ["off", "Off", "Serve legacy retrieval only."],
  ["shadow", "Shadow", "Serve legacy results while canonical profiles run for comparison."],
  ["canary", "Canary", "Serve canonical profiles to a stable percentage of requests."],
  ["primary", "Primary", "Serve canonical profile retrieval for all requests, with bounded domain fallback."],
];

export default function SearchProfileRolloutClient({ initial }: { initial: SearchProfileRolloutConfig }) {
  const [config, setConfig] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    const increasesTraffic =
      config.mode === "primary" ||
      (config.mode === "canary" && config.canaryPercent > baseline.canaryPercent) ||
      (!config.killSwitch && baseline.killSwitch);
    const confirmed = window.confirm(
      increasesTraffic
        ? "This can increase canonical profile traffic in production. Confirm the mode, percentage, and Search Health status before proceeding."
        : "Apply Search Profile rollout configuration?",
    );
    if (!confirmed) return;

    setSaving(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/settings/search-profile-rollout", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ config, reason }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error ?? "Update failed.");
      const next = { ...config, ...payload.config, source: "database" as const };
      setConfig(next);
      setBaseline(next);
      setReason("");
      setNotice("Search Profile rollout saved. Cache invalidated and audit entry recorded.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Update failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section id="search-profile-rollout" className="rounded-3xl border border-emerald-400/25 bg-[#101713] p-6">
      <p className="text-xs font-black uppercase tracking-[.25em] text-emerald-300">Search API cutover</p>
      <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black">Search Profile Rollout</h2>
          <p className="mt-2 max-w-3xl text-sm text-white/60">
            Control whether public search serves legacy retrieval, shadows canonical profiles, uses a canary percentage, or makes canonical profiles authoritative.
          </p>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/60">
          Source: {config.source}
        </span>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold">
          SEARCH_PROFILE_MODE
          <select
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3"
            value={config.mode}
            onChange={(event) => setConfig({ ...config, mode: event.target.value as SearchProfileMode })}
          >
            {modes.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="text-sm font-bold">
          SEARCH_PROFILE_CANARY_PERCENT
          <input
            className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3"
            type="number"
            min={0}
            max={100}
            step={1}
            disabled={config.mode !== "canary"}
            value={config.canaryPercent}
            onChange={(event) => setConfig({ ...config, canaryPercent: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {modes.map(([value, label, description]) => (
          <button
            key={value}
            type="button"
            onClick={() => setConfig({ ...config, mode: value })}
            className={`rounded-2xl border p-4 text-left transition ${config.mode === value ? "border-emerald-300/60 bg-emerald-400/10" : "border-white/10 bg-black/20 hover:border-white/25"}`}
          >
            <span className="font-black">{label}</span>
            <span className="mt-1 block text-xs text-white/55">{description}</span>
          </button>
        ))}
      </div>

      <label className="mt-4 flex items-start gap-3 rounded-2xl border border-rose-400/25 bg-rose-500/5 p-4">
        <input
          className="mt-1"
          type="checkbox"
          checked={config.killSwitch}
          onChange={(event) => setConfig({ ...config, killSwitch: event.target.checked })}
        />
        <span>
          <span className="block text-sm font-black text-rose-100">Emergency kill switch</span>
          <span className="mt-1 block text-xs text-white/55">Immediately forces effective mode to off without deleting the selected rollout mode.</span>
        </span>
      </label>

      <label className="mt-4 block text-sm font-bold">
        Change reason
        <input
          className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 p-3"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why is this rollout changing?"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-black disabled:opacity-50"
        >
          {saving ? "Saving…" : "Review and save"}
        </button>
        <a href="/admin/dashboard/search-health?tab=configuration" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">
          View Search Health
        </a>
        <a href="/admin/dashboard/settings/location-tools/search-profiles" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">
          Open Search Profiles
        </a>
      </div>

      {notice ? <p role="status" className="mt-4 text-sm text-amber-100">{notice}</p> : null}
    </section>
  );
}
