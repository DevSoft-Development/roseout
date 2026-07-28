"use client";

import { useState } from "react";
import type { RolloutSettings } from "@/lib/search/rankingRollout";

export default function SearchMlRolloutClient({
  initial,
}: {
  initial: RolloutSettings;
}) {
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

    if (
      !confirm(
        strong
          ? "This can substantially increase ML-ranked production traffic. Confirm and proceed?"
          : increase
            ? "Increase ML rollout traffic?"
            : "Apply ML rollout settings?",
      )
    ) {
      return;
    }

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

  const inputClass =
    "mt-2 w-full rounded-xl border border-white/10 bg-black/30 p-3 text-white outline-none transition focus:border-rose-400/60 focus:ring-2 focus:ring-rose-500/15";

  return (
    <section
      id="search-ml-rollout"
      className="rounded-3xl border border-rose-400/25 bg-gradient-to-br from-[#24100f] via-[#160d0b] to-[#0d0908] p-6 shadow-[0_12px_32px_rgba(225,6,42,0.08)]"
    >
      <p className="text-xs font-black uppercase tracking-[.25em] text-rose-300">
        Ranking controls
      </p>
      <h2 className="mt-2 text-2xl font-black text-white">Search ML Rollout</h2>
      <p className="mt-2 text-sm text-white/65">
        Controls the existing hybrid ranking system independently from Search Core V2 traffic.
      </p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold text-white/85">
          ML rollout percentage
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={settings.rollout_percent}
            onChange={(event) =>
              setSettings({
                ...settings,
                rollout_percent: Number(event.target.value),
              })
            }
            className={inputClass}
          />
        </label>

        <label className="text-sm font-bold text-white/85">
          Eligible markets
          <input
            value={settings.eligible_markets.join(", ")}
            onChange={(event) =>
              setSettings({
                ...settings,
                eligible_markets: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
            className={inputClass}
            placeholder="nyc, long_island"
          />
        </label>

        {[
          ["enabled", "ML ranking enabled"],
          ["shadow_enabled", "Shadow only"],
          ["admin_only", "Internal admins only"],
          ["kill_switch", "Emergency kill switch"],
        ].map(([key, label]) => (
          <label
            key={key}
            className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-white/85 transition hover:border-rose-400/30"
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#e1062a]"
              checked={Boolean(settings[key as keyof RolloutSettings])}
              onChange={(event) =>
                setSettings({ ...settings, [key]: event.target.checked })
              }
            />
            {label}
          </label>
        ))}
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-bold text-white/85">
          Model version
          <input
            value={settings.model_version}
            onChange={(event) =>
              setSettings({ ...settings, model_version: event.target.value })
            }
            className={inputClass}
          />
        </label>
        <label className="text-sm font-bold text-white/85">
          Assignment salt
          <input
            value={settings.assignment_salt}
            onChange={(event) =>
              setSettings({ ...settings, assignment_salt: event.target.value })
            }
            className={inputClass}
          />
        </label>
      </div>

      <label className="mt-4 block text-sm font-bold text-white/85">
        Change reason
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={inputClass}
          placeholder="Optional for routine changes"
        />
      </label>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white transition hover:bg-[#f1163a] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "Saving…" : "Review and save"}
        </button>
        <a
          href="/admin/dashboard/search-health?tab=ml-ranking"
          className="rounded-full border border-white/15 bg-white/[.03] px-5 py-3 text-sm font-black text-white transition hover:border-rose-300/40 hover:bg-white/[.06]"
        >
          View ML ranking health
        </a>
      </div>

      {notice ? (
        <p
          role="status"
          className={`mt-4 rounded-xl border px-4 py-3 text-sm ${
            noticeType === "error"
              ? "border-red-400/30 bg-red-500/10 text-red-100"
              : "border-emerald-400/20 bg-emerald-500/10 text-emerald-100"
          }`}
        >
          {notice}
        </p>
      ) : null}
    </section>
  );
}
