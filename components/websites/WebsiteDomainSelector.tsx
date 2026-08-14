"use client";

import { useMemo, useState } from "react";

type Website = {
  location_id: string;
  domain: string | null;
  platform_domain?: string | null;
  custom_content?: Record<string, unknown>;
  dns_status?: string | null;
  ssl_status?: string | null;
};

function suggestedSubdomain(locationName: string) {
  const base = locationName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 54) || "yourbusiness";
  return `${base}.theouthaven.com`;
}

export function WebsiteDomainSelector({ initialWebsite, locationName }: { initialWebsite: Website; locationName: string }) {
  const initialChoice = initialWebsite.domain ? "custom" : "subdomain";
  const [mode, setMode] = useState<"subdomain" | "custom">(initialChoice);
  const [customDomain, setCustomDomain] = useState(initialWebsite.domain || "");
  const [savedDomain, setSavedDomain] = useState(initialWebsite.domain || "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const platformDomain = useMemo(
    () => initialWebsite.platform_domain || suggestedSubdomain(locationName),
    [initialWebsite.platform_domain, locationName],
  );

  async function saveDomainChoice(nextMode: "subdomain" | "custom" = mode) {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/business/website", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        location_id: initialWebsite.location_id,
        domain_mode: nextMode,
        ...(nextMode === "custom" ? { domain: customDomain } : {}),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setMessage(data?.error || "We could not save your website address.");
      return;
    }
    setMode(nextMode);
    setSavedDomain(data?.website?.domain || "");
    setMessage(nextMode === "custom" ? "Custom domain saved. DNS and SSL will be verified during connection." : "TheOutHaven subdomain selected.");
  }

  return (
    <section className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#f5b700]">Website address</p>
          <h2 className="mt-2 text-2xl font-black">Choose how customers will reach your website</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/60">Use a free TheOutHaven subdomain or connect a domain you already own. You can change this before publishing.</p>
        </div>
        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-2 text-xs font-black text-white/60">Part of website setup</span>
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-2">
        <button
          type="button"
          onClick={() => { setMode("subdomain"); void saveDomainChoice("subdomain"); }}
          className={`rounded-2xl border p-5 text-left transition ${mode === "subdomain" ? "border-[#f5b700]/60 bg-[#f5b700]/10" : "border-white/10 bg-black/20 hover:bg-white/[0.05]"}`}
        >
          <div className="flex items-center justify-between gap-3"><p className="font-black">Use a TheOutHaven subdomain</p><span className="text-xs font-black text-emerald-200">Included</span></div>
          <p className="mt-2 text-sm text-white/55">Fastest setup. No DNS changes are required from the business.</p>
          <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm font-black text-[#f5b700]">{platformDomain}</div>
        </button>

        <button
          type="button"
          onClick={() => setMode("custom")}
          className={`rounded-2xl border p-5 text-left transition ${mode === "custom" ? "border-[#f5b700]/60 bg-[#f5b700]/10" : "border-white/10 bg-black/20 hover:bg-white/[0.05]"}`}
        >
          <p className="font-black">Use my own domain</p>
          <p className="mt-2 text-sm text-white/55">Keep your existing brand address, such as yourrestaurant.com. We&apos;ll guide you through DNS verification and SSL connection.</p>
          {savedDomain ? <div className="mt-4 rounded-xl border border-emerald-300/20 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100">{savedDomain}</div> : null}
        </button>
      </div>

      {mode === "custom" ? <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
        <label className="text-sm font-black">Domain you own</label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input value={customDomain} onChange={(event) => setCustomDomain(event.target.value)} placeholder="yourrestaurant.com" className="h-12 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 text-sm font-bold text-white outline-none focus:border-[#f5b700]/50" />
          <button type="button" onClick={() => void saveDomainChoice("custom")} disabled={saving || customDomain.trim().length < 4} className="h-12 rounded-xl bg-[#f5b700] px-5 text-sm font-black text-black disabled:opacity-40">{saving ? "Saving…" : "Use this domain"}</button>
        </div>
        <p className="mt-3 text-xs leading-5 text-white/45">We only save the domain choice here. DNS ownership and SSL must verify before the custom address is considered fully connected.</p>
      </div> : null}

      {message ? <p className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm font-bold text-white/70">{message}</p> : null}
    </section>
  );
}
