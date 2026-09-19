"use client";

import { useState } from "react";
import type { AiTagHelperSettings } from "@/lib/ai-tag-helper-settings";
import {
  SettingsControlCard,
  SettingsField,
  settingsInputClass,
  settingsPrimaryButtonClass,
} from "./SettingsControlPrimitives";

const opts = [
  ["off", "Off"],
  ["admins_only", "Admins only"],
  ["paid_only", "Paid locations only"],
  ["all", "All locations"],
];

export default function AiTagHelperSettingsClient({ initial }: { initial: AiTagHelperSettings }) {
  const [access, setAccess] = useState(initial.access);
  const [status, setStatus] = useState("");

  async function save() {
    setStatus("Saving…");
    const res = await fetch("/api/admin/settings/ai-tag-helper", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access }),
    });
    const data = await res.json().catch(() => ({}));
    setStatus(res.ok ? "AI Tag Helper access saved." : data.error || "Could not save AI Tag Helper setting.");
  }

  return (
    <SettingsControlCard
      eyebrow="AI assistance"
      title="AI Tag Helper"
      description="Choose who can generate suggested profile tags in CRM and Location Dashboard. Suggestions remain drafts until reviewed."
      meta="Human review required"
    >
      <SettingsField label="Access policy" helper="Controls who can request AI-generated tag suggestions.">
        <select value={access} onChange={(e) => setAccess(e.target.value as AiTagHelperSettings["access"])} className={settingsInputClass}>
          {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </SettingsField>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          "AI suggestions are drafts only.",
          "AI never overwrites owner or Admin edits.",
          "Review Keywords stay private and derive from reviews only.",
        ].map((item) => (
          <div key={item} className="rounded-2xl border border-[var(--admin-shell-border)] bg-[var(--admin-shell-card-strong)] p-4 text-xs leading-5 text-[var(--admin-shell-soft)]">
            {item}
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={save} className={settingsPrimaryButtonClass}>Save access policy</button>
        {status ? <p role="status" className="text-sm font-bold text-[var(--admin-shell-soft)]">{status}</p> : null}
      </div>
    </SettingsControlCard>
  );
}
