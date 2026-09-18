"use client";
import { useState } from "react";
import type {
  SearchCoreConfig,
  SearchCoreMode,
} from "@/lib/search/searchCoreConfig";
const modes: Array<[SearchCoreMode, string]> = [
  ["legacy", "Legacy only"],
  ["shadow", "Shadow only"],
  ["percentage", "Percentage rollout"],
  ["v2", "V2 only"],
];
export default function SearchCoreRolloutClient({
  initial,
}: {
  initial: SearchCoreConfig;
}) {
  const [config, setConfig] = useState(initial);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    const increase = config.rolloutPercentage > initial.rolloutPercentage;
    const strong =
      config.mode === "v2" ||
      config.rolloutPercentage === 100 ||
      config.rolloutPercentage - initial.rolloutPercentage > 10 ||
      (!config.killSwitch && initial.killSwitch);
    if (
      !confirm(
        strong
          ? "This change can substantially increase V2 production traffic. Confirm the effective configuration and proceed?"
          : increase
            ? "Increase V2 traffic?"
            : "Apply Search Core configuration?",
      )
    )
      return;
    setSaving(true);
    setNotice("");
    const response = await fetch("/api/admin/settings/search-core", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ config, reason }),
    });
    const json = await response.json();
    setSaving(false);
    if (!response.ok) {
      setNotice(json.error || "Update failed");
      return;
    }
    setConfig({ ...config, ...json.config, source: "database" });
    setNotice(
      "Configuration saved and cache invalidated. Audit entry recorded.",
    );
  }
  return (
    <section
      id="search-core-v2-rollout"
      className="rounded-3xl border border-rose-400/25 bg-[#160d0b] p-6"
    >
      <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">
        Production controls
      </p>
      <h2 className="mt-2 text-2xl font-black">Search Core V2 Rollout</h2>
      <p className="mt-2 text-sm text-white/60">
        Configured source: {config.source}. Kill switch and decreases remain
        immediately reversible.
      </p>
      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold">
          Serving mode
          <select
            className="mt-2 w-full rounded-xl bg-black/40 p-3"
            value={config.mode}
            onChange={(e) =>
              setConfig({ ...config, mode: e.target.value as SearchCoreMode })
            }
          >
            {modes.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-bold">
          Public V2 rollout percentage
          <input
            className="mt-2 w-full rounded-xl bg-black/40 p-3"
            type="number"
            min={0}
            max={100}
            step={1}
            value={config.rolloutPercentage}
            onChange={(e) =>
              setConfig({
                ...config,
                rolloutPercentage: Number(e.target.value),
              })
            }
          />
        </label>
        {[
          ["enabled", "Search Core enabled"],
          ["shadowEnabled", "Shadow comparison"],
          ["killSwitch", "Emergency kill switch"],
          ["internalOnly", "Internal admins only"],
        ].map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-3 rounded-xl border border-white/10 p-3 text-sm font-bold"
          >
            <input
              type="checkbox"
              checked={Boolean(config[key as keyof SearchCoreConfig])}
              onChange={(e) =>
                setConfig({ ...config, [key]: e.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>
      <label className="mt-4 block text-sm font-bold">
        Change or warning-override reason
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-2 w-full rounded-xl bg-black/40 p-3"
          placeholder="Optional for routine changes; required by policy for warning overrides"
        />
      </label>
      <div className="mt-5 flex flex-wrap gap-3">
        <button
          disabled={saving}
          onClick={save}
          className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-50"
        >
          {saving ? "Saving…" : "Review and save"}
        </button>
        <a
          className="rounded-full border border-white/15 px-5 py-3 text-sm font-black"
          href="/admin/dashboard/search-health?tab=configuration"
        >
          View effective configuration
        </a>
      </div>
      {notice ? (
        <p role="status" className="mt-4 text-sm text-amber-100">
          {notice}
        </p>
      ) : null}
    </section>
  );
}
