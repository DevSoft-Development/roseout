"use client";

import { useState } from "react";
import type { DomainBenefitSettings } from "@/lib/domains/benefit-settings";

export default function DomainBenefitSettingsClient({ initial }: { initial: DomainBenefitSettings }) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/settings/domain-benefit", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to save settings.");
      setSettings(data.settings);
      setMessage("Domain benefit settings saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-6">
      <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-300">Partner Pro</p>
      <h2 className="mt-2 text-xl font-bold text-rose-100">Included Domain Benefit</h2>
      <p className="mt-2 text-sm text-white/70">Control whether Partner Pro includes a first-year domain and whether TheOutHaven sponsors future renewals.</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <input type="checkbox" className="mt-1" checked={settings.firstYearIncluded} onChange={(e) => setSettings((current) => ({ ...current, firstYearIncluded: e.target.checked }))} />
          <span><span className="block font-black">Free first-year domain</span><span className="mt-1 block text-xs leading-5 text-white/55">When on, an eligible Partner Pro location can claim one standard domain with the first registration year included.</span></span>
        </label>
        <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
          <input type="checkbox" className="mt-1" checked={settings.renewalIncluded} disabled={!settings.firstYearIncluded} onChange={(e) => setSettings((current) => ({ ...current, renewalIncluded: e.target.checked }))} />
          <span><span className="block font-black">Free renewal</span><span className="mt-1 block text-xs leading-5 text-white/55">When on, eligible renewals can remain sponsored. When off, only the first registration year is included.</span></span>
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/65">
        Customer offer: {settings.firstYearIncluded ? (settings.renewalIncluded ? "First year and eligible renewals included." : "First year included; renewal is not included.") : "Included domain offer is off."}
      </div>
      <button onClick={save} disabled={saving} className="mt-5 rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-60">{saving ? "Saving…" : "Save domain settings"}</button>
      {message ? <p className="mt-3 text-sm text-white/70">{message}</p> : null}
    </section>
  );
}
