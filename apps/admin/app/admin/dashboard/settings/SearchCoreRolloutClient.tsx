"use client";

import { useState } from "react";
import type { SearchCoreConfig, SearchCoreMode } from "@/lib/search/searchCoreConfig";
import {
  SettingsControlCard,
  SettingsField,
  SettingsToggle,
  settingsInputClass,
  settingsPrimaryButtonClass,
  settingsSecondaryButtonClass,
} from "./SettingsControlPrimitives";

const modes: Array<[SearchCoreMode, string]> = [
  ["legacy", "Legacy only"],
  ["shadow", "Shadow only"],
  ["percentage", "Percentage rollout"],
  ["v2", "V2 only"],
];

export default function SearchCoreRolloutClient({ initial }: { initial: SearchCoreConfig }) {
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
    if (!confirm(strong
      ? "This change can substantially increase V2 production traffic. Confirm the effective configuration and proceed?"
      : increase ? "Increase V2 traffic?" : "Apply Search Core configuration?")) return;

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
    setNotice("Configuration saved. Cache invalidated and audit entry recorded.");
  }

  return (
    <SettingsControlCard
      eyebrow="Production control"
      title="Search Core V2"
      description="Control how much public search traffic reaches the V2 search core. Changes that increase production traffic require confirmation."
      meta={<>Source · {config.source}</>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsField label="Serving mode" helper="Choose whether traffic stays on legacy, runs in shadow, rolls out gradually, or uses V2 only.">
          <select className={settingsInputClass} value={config.mode} onChange={(e) => setConfig({ ...config, mode: e.target.value as SearchCoreMode })}>
            {modes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </SettingsField>
        <SettingsField label="Public V2 rollout" helper="Percentage of eligible public requests served by V2 when percentage rollout is active.">
          <div className="relative">
            <input className={settingsInputClass} type="number" min={0} max={100} step={1} value={config.rolloutPercentage} onChange={(e) => setConfig({ ...config, rolloutPercentage: Number(e.target.value) })} />
            <span className="pointer-events-none absolute right-3 top-3 text-xs font-black text-[var(--admin-shell-muted)]">%</span>
          </div>
        </SettingsField>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <SettingsToggle checked={config.enabled} onChange={(checked) => setConfig({ ...config, enabled: checked })} label="Search Core enabled" description="Allows Search Core V2 to participate according to the selected serving mode." />
        <SettingsToggle checked={config.shadowEnabled} onChange={(checked) => setConfig({ ...config, shadowEnabled: checked })} label="Shadow comparison" description="Runs V2 in parallel for measurement without changing customer results." />
        <SettingsToggle checked={config.internalOnly} onChange={(checked) => setConfig({ ...config, internalOnly: checked })} label="Internal admins only" description="Restricts V2 serving to authenticated internal Admin traffic." />
        <SettingsToggle checked={config.killSwitch} onChange={(checked) => setConfig({ ...config, killSwitch: checked })} label="Emergency kill switch" description="Immediately forces public traffic away from V2." danger />
      </div>

      <div className="mt-5">
        <SettingsField label="Change reason" helper="Optional for routine changes. Required when policy asks for an override reason.">
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={settingsInputClass} placeholder="Describe why this rollout is changing" />
        </SettingsField>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button disabled={saving} onClick={save} className={settingsPrimaryButtonClass}>{saving ? "Saving…" : "Review and save"}</button>
        <a className={settingsSecondaryButtonClass} href="/admin/dashboard/search-health?tab=configuration">View effective configuration</a>
      </div>
      {notice ? <p role="status" className="mt-4 text-sm font-bold text-[var(--admin-shell-soft)]">{notice}</p> : null}
    </SettingsControlCard>
  );
}
