"use client";

import { useState } from "react";
import type { SearchProfileMode } from "@/lib/search/v2/retrieval/searchProfileMode";
import type { SearchProfileRolloutConfig } from "@/lib/search/v2/retrieval/searchProfileRolloutConfig";
import {
  SettingsControlCard,
  SettingsField,
  SettingsToggle,
  settingsInputClass,
  settingsPrimaryButtonClass,
  settingsSecondaryButtonClass,
} from "./SettingsControlPrimitives";

const modes: Array<[SearchProfileMode, string, string]> = [
  ["off", "Off", "Serve legacy retrieval only."],
  ["shadow", "Shadow", "Run canonical profiles for comparison while legacy results remain authoritative."],
  ["canary", "Canary", "Serve canonical profiles to a stable percentage of requests."],
  ["primary", "Primary", "Use canonical profile retrieval for all requests with bounded domain fallback."],
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
    if (!window.confirm(increasesTraffic
      ? "This can increase canonical profile traffic in production. Confirm the mode, percentage, and Search Health status before proceeding."
      : "Apply Search Profile rollout configuration?")) return;

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
    <SettingsControlCard
      eyebrow="Search API cutover"
      title="Search Profile Rollout"
      description="Control when canonical search profiles run in shadow, limited canary traffic, or as the authoritative retrieval path."
      meta={<>Source · {config.source}</>}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {modes.map(([value, label, description]) => {
          const active = config.mode === value;
          return (
            <button key={value} type="button" onClick={() => setConfig({ ...config, mode: value })}
              className={`rounded-2xl border p-4 text-left transition ${active ? "border-[var(--admin-shell-accent-border)] bg-[var(--admin-shell-accent-soft)]" : "border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] hover:border-[var(--admin-shell-border-strong)]"}`}>
              <span className="text-sm font-black text-[var(--admin-shell-text)]">{label}</span>
              <span className="mt-1 block text-xs leading-5 text-[var(--admin-shell-muted)]">{description}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <SettingsField label="Selected mode" helper="The friendly control above and this select stay synchronized.">
          <select className={settingsInputClass} value={config.mode} onChange={(event) => setConfig({ ...config, mode: event.target.value as SearchProfileMode })}>
            {modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </SettingsField>
        <SettingsField label="Canary traffic" helper="Used only when Canary mode is selected.">
          <div className="relative">
            <input className={settingsInputClass} type="number" min={0} max={100} step={1} disabled={config.mode !== "canary"} value={config.canaryPercent} onChange={(event) => setConfig({ ...config, canaryPercent: Number(event.target.value) })} />
            <span className="pointer-events-none absolute right-3 top-3 text-xs font-black text-[var(--admin-shell-muted)]">%</span>
          </div>
        </SettingsField>
      </div>

      <div className="mt-5">
        <SettingsToggle checked={config.killSwitch} onChange={(checked) => setConfig({ ...config, killSwitch: checked })} label="Emergency kill switch" description="Immediately forces effective mode to Off without deleting the selected rollout mode." danger />
      </div>

      <div className="mt-5">
        <SettingsField label="Change reason" helper="Provide context for the audit trail when changing production rollout behavior.">
          <input className={settingsInputClass} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why is this rollout changing?" />
        </SettingsField>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={saving} onClick={save} className={settingsPrimaryButtonClass}>{saving ? "Saving…" : "Review and save"}</button>
        <a href="/admin/dashboard/search-health?tab=configuration" className={settingsSecondaryButtonClass}>View Search Health</a>
        <a href="/admin/dashboard/settings/location-tools/search-profiles" className={settingsSecondaryButtonClass}>Open Search Profiles</a>
      </div>
      {notice ? <p role="status" className="mt-4 text-sm font-bold text-[var(--admin-shell-soft)]">{notice}</p> : null}
    </SettingsControlCard>
  );
}
