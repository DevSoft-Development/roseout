"use client";

import { useState } from "react";
import {
  SettingsControlCard,
  SettingsField,
  SettingsToggle,
  settingsInputClass,
  settingsPrimaryButtonClass,
} from "./SettingsControlPrimitives";

export default function SearchLimitsClient({ initial }: { initial: any }) {
  const [s, setS] = useState(initial);
  const [message, setMessage] = useState("");

  async function save() {
    const response = await fetch("/api/admin/settings/search-limits", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(s),
    });
    setMessage(response.ok ? "Search limit settings saved." : "Could not save settings.");
  }

  return (
    <SettingsControlCard
      eyebrow="Usage policy"
      title="Customer Search Limits"
      description="Control weekly AI-search allowances for guests and free accounts. When limits are disabled, usage continues to be tracked without blocking customers."
      meta={s.enabled ? "Limits active" : "Tracking only"}
    >
      <SettingsToggle checked={Boolean(s.enabled)} onChange={(checked) => setS({ ...s, enabled: checked })} label="Enable weekly search limits" description="When enabled, guests and free accounts are blocked after reaching their configured weekly allowance." />

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <SettingsField label="Guest weekly searches" helper="Weekly allowance for visitors who are not signed in.">
          <input type="number" min={0} className={settingsInputClass} value={s.guestWeeklyLimit} onChange={(e) => setS({ ...s, guestWeeklyLimit: Number(e.target.value) })} />
        </SettingsField>
        <SettingsField label="Free account weekly searches" helper="Weekly allowance for signed-in customers on the free consumer experience.">
          <input type="number" min={0} className={settingsInputClass} value={s.freeUserWeeklyLimit} onChange={(e) => setS({ ...s, freeUserWeeklyLimit: Number(e.target.value) })} />
        </SettingsField>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <SettingsToggle checked={Boolean(s.betaUsersUnlimited)} onChange={(checked) => setS({ ...s, betaUsersUnlimited: checked })} label="Beta users unlimited" description="Exempts approved beta users from weekly limits." />
        <SettingsToggle checked={Boolean(s.adminUsersUnlimited)} onChange={(checked) => setS({ ...s, adminUsersUnlimited: checked })} label="Admin and team unlimited" description="Exempts internal team accounts from weekly limits." />
        <SettingsToggle checked={Boolean(s.upgradeCtaEnabled)} onChange={(checked) => setS({ ...s, upgradeCtaEnabled: checked })} label="Upgrade prompt enabled" description="Shows an upgrade prompt when an eligible user reaches the limit." />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={save} className={settingsPrimaryButtonClass}>Save usage policy</button>
        {message ? <p role="status" className="text-sm font-bold text-[var(--admin-shell-soft)]">{message}</p> : null}
      </div>
    </SettingsControlCard>
  );
}
