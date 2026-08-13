"use client";

import { FormEvent, useState } from "react";

type EligibilityResult = {
  domain: string;
  included: boolean;
  code: string;
  message: string;
  available?: boolean;
  claimedDomain?: string;
};

export default function PartnerProDomainSearch({ locationId, claimedDomain }: { locationId: string; claimedDomain?: string | null }) {
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EligibilityResult | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = domain.trim().toLowerCase();
    if (!value) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/business/domains/eligibility", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location_id: locationId, domain: value }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Unable to check this domain right now.");
      setResult(data as EligibilityResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to check this domain right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-rose-200/15 bg-white/[0.04] p-6">
        <div className="max-w-3xl">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Partner Pro benefit</p>
          <h2 className="mt-3 text-2xl font-black">Find your included custom domain</h2>
          <p className="mt-2 text-sm leading-6 text-white/65">Search for a domain for this location. Eligible standard domains are included with Partner Pro while your membership remains active.</p>
        </div>
        {claimedDomain ? (
          <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">Included domain</p>
            <p className="mt-2 text-xl font-black text-emerald-50">{claimedDomain}</p>
            <p className="mt-1 text-sm text-emerald-100/70">This location has already used its included-domain benefit.</p>
          </div>
        ) : null}
      </section>

      <section className="rounded-3xl border border-white/10 bg-black/25 p-6">
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="partner-pro-domain-search">Domain name</label>
          <input
            id="partner-pro-domain-search"
            value={domain}
            onChange={(event) => setDomain(event.target.value)}
            placeholder="yourbusiness.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-rose-300/50"
          />
          <button disabled={loading} className="rounded-2xl bg-[#f5b700] px-6 py-3 text-sm font-black text-black disabled:cursor-wait disabled:opacity-60">
            {loading ? "Checking…" : "Check domain"}
          </button>
        </form>
        <p className="mt-3 text-xs leading-5 text-white/45">Domain registration is not completed from this screen yet. This step checks availability and whether the domain qualifies for your included Partner Pro benefit.</p>
      </section>

      {error ? <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm font-bold text-red-100">{error}</div> : null}

      {result ? (
        <section className={`rounded-3xl border p-6 ${result.included ? "border-emerald-300/25 bg-emerald-500/10" : "border-white/10 bg-white/[0.04]"}`}>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Search result</p>
              <h3 className="mt-2 text-2xl font-black">{result.domain}</h3>
              <p className="mt-2 text-sm text-white/70">{result.message}</p>
            </div>
            <span className={`self-start rounded-full px-4 py-2 text-xs font-black ${result.included ? "bg-emerald-400 text-emerald-950" : "border border-white/15 bg-white/[0.06] text-white/75"}`}>
              {result.included ? "Included with Partner Pro" : result.code === "domain_unavailable" ? "Unavailable" : result.code === "premium_domain" ? "Premium domain" : "Not eligible"}
            </span>
          </div>
          {result.included ? <p className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">This domain qualifies for your included Partner Pro domain. Registration and connection will be enabled in the next domain-provisioning step.</p> : null}
        </section>
      ) : null}
    </div>
  );
}
