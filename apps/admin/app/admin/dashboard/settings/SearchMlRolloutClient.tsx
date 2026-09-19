"use client";

import { useState } from "react";
import type { RolloutSettings } from "@/lib/search/rankingRollout";
import {
  SettingsControlCard,
  SettingsField,
  SettingsToggle,
  settingsInputClass,
  settingsPrimaryButtonClass,
  settingsSecondaryButtonClass,
} from "./SettingsControlPrimitives";

export default function SearchMlRolloutClient({ initial }: { initial: RolloutSettings }) {
  const [settings, setSettings] = useState(initial);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeType, setNoticeType] = useState<"success" | "error" | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    const increase = settings.rollout_percent > initial.rollout_percent;
    const strong =
      settings.rollout_percent === 100 ||
      settings.rollout_percent - initial.rollout_percent > 10 ||
      (!settings.kill_switch && initial.kill_switch);
    if (!confirm(strong
      ? "This can substantially increase ML-ranked production traffic. Confirm and proceed?"
      : increase ? "Increase ML rollout traffic?" : "Apply ML rollout settings?")) return;

    setSaving(true);
    setNotice("");
    setNoticeType(null);
    try {
      const response = await fetch("/api/admin/settings/search-ml-rollout", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings, reason }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(json.error || "Unable to update ML rollout settings.");
        setNoticeType("error");
        return;
      }
      setSettings(json.settings);
      setNotice("ML rollout settings saved. Audit entry recorded.");
      setNoticeType("success");
    } catch {
      setNotice("Unable to reach the ML rollout settings service.");
      setNoticeType("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsControlCard
      eyebrow="Ranking controls"
      title="Search ML Rollout"
      description="Manage the hybrid ML ranking system independently from Search Core V2 traffic."
      meta={<>Rollout · {settings.rollout_percent}%</>}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <SettingsField label="ML rollout" helper="Share of eligible traffic that can receive ML-ranked results.">
          <div className="relative">
            <input type="number" min={0} max={100} step={1} value={settings.rollout_percent} onChange={(event) => setSettings({ ...settings, rollout_percent: Number(event.target.value) })} className={settingsInputClass} />
            <span className="pointer-events-none absolute right-3 top-3 text-xs font-black text-[var(--admin-shell-muted)]">%</span>
          </div>
        </SettingsField>
        <SettingsField label="Eligible markets" helper="Comma-separated market identifiers that may receive ML ranking.">
          <input value={settings.eligible_markets.join(", ")} onChange={(event) => setSettings({ ...settings, eligible_markets: event.target.value.split(",").map((value) => value.trim()).filter(Boolean) })} className={settingsInputClass} placeholder="nyc, long_island" />
        </SettingsField>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <SettingsToggle checked={settings.enabled} onChange={(checked) => setSettings({ ...settings, enabled: checked })} label="ML ranking enabled" description="Allows the ML ranker to participate for eligible requests." />
        <SettingsToggle checked={settings.shadow_enabled} onChange={(checked) => setSettings({ ...settings, shadow_enabled: checked })} label="Shadow only" description="Measures ML ranking without changing customer-facing order." />
        <SettingsToggle checked={settings.admin_only} onChange={(checked) => setSettings({ ...settings, admin_only: checked })} label="Internal admins only" description="Limits active ML-ranked results to internal Admin traffic." />
        <SettingsToggle checked={settings.kill_switch} onChange={(checked) => setSettings({ ...settings, kill_switch: checked })} label="Emergency kill switch" description="Immediately stops ML-ranked production serving." danger />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <SettingsField label="Model version" helper="Version identifier recorded with ranking decisions.">
          <input value={settings.model_version} onChange={(event) => setSettings({ ...settings, model_version: event.target.value })} className={settingsInputClass} />
        </SettingsField>
        <SettingsField label="Assignment salt" helper="Stable assignment key used for deterministic rollout bucketing.">
          <input value={settings.assignment_salt} onChange={(event) => setSettings({ ...settings, assignment_salt: event.target.value })} className={settingsInputClass} />
        </SettingsField>
      </div>

      <div className="mt-5">
        <SettingsField label="Change reason" helper="Add context for the production audit trail.">
          <input value={reason} onChange={(event) => setReason(event.target.value)} className={settingsInputClass} placeholder="Optional for routine changes" />
        </SettingsField>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" disabled={saving} onClick={save} className={settingsPrimaryButtonClass}>{saving ? "Saving…" : "Review and save"}</button>
        <a href="/admin/dashboard/search-health?tab=ml-ranking" className={settingsSecondaryButtonClass}>View ML ranking health</a>
      </div>

      {notice ? (
        <p role="status" className={`mt-4 rounded-xl border px-4 py-3 text-sm font-bold ${noticeType === "error" ? "border-[var(--admin-shell-accent-border)] bg-[var(--admin-shell-accent-soft)] text-[var(--admin-shell-text)]" : "border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] text-[var(--admin-shell-soft)]"}`}>
          {notice}
        </p>
      ) : null}
    </SettingsControlCard>
  );
}
