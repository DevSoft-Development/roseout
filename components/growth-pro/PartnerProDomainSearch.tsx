"use client";

import { FormEvent, useState } from "react";

type EligibilityResult = { domain: string; included: boolean; code: string; message: string; available?: boolean; claimedDomain?: string };
type Contact = { first_name: string; last_name: string; org_name: string; address1: string; address2: string; city: string; state: string; postal_code: string; country: string; phone: string; email: string };

const EMPTY_CONTACT: Contact = { first_name: "", last_name: "", org_name: "", address1: "", address2: "", city: "", state: "", postal_code: "", country: "US", phone: "", email: "" };
const inputClass = "rounded-2xl border border-white/10 bg-white/[0.05] px-4 py-3 text-white outline-none placeholder:text-white/35 focus:border-rose-300/50";

export default function PartnerProDomainSearch({ locationId, claimedDomain }: { locationId: string; claimedDomain?: string | null }) {
  const [domain, setDomain] = useState("");
  const [checking, setChecking] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EligibilityResult | null>(null);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [registrationMessage, setRegistrationMessage] = useState("");

  function setField(field: keyof Contact, value: string) {
    setContact((current) => ({ ...current, [field]: value }));
  }

  async function checkDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = domain.trim().toLowerCase();
    if (!value) return;
    setChecking(true);
    setError("");
    setRegistrationMessage("");
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
      setChecking(false);
    }
  }

  async function registerDomain(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!result?.included) return;
    setRegistering(true);
    setError("");
    setRegistrationMessage("");
    try {
      const response = await fetch("/api/business/domains/provision", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ location_id: locationId, domain: result.domain, contact }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok && response.status !== 202) throw new Error(data?.error || "Unable to register this domain right now.");
      setRegistrationMessage(data?.message || data?.error || "Your domain registration is being processed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to register this domain right now.");
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-rose-200/15 bg-white/[0.04] p-6">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">Partner Pro benefit</p>
        <h2 className="mt-3 text-2xl font-black">Find your included custom domain</h2>
        <p className="mt-2 text-sm leading-6 text-white/65">Choose one eligible standard domain for your location. Registration and renewals are included while Partner Pro remains active.</p>
        {claimedDomain ? <div className="mt-5 rounded-2xl border border-emerald-300/20 bg-emerald-500/10 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">Included domain</p><p className="mt-2 text-xl font-black text-emerald-50">{claimedDomain}</p><p className="mt-1 text-sm text-emerald-100/70">This location has already used its included-domain benefit.</p></div> : null}
      </section>

      {!claimedDomain ? <section className="rounded-3xl border border-white/10 bg-black/25 p-6"><form onSubmit={checkDomain} className="flex flex-col gap-3 sm:flex-row"><input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="yourbusiness.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} className={`min-w-0 flex-1 ${inputClass}`} /><button disabled={checking} className="rounded-2xl bg-[#f5b700] px-6 py-3 text-sm font-black text-black disabled:opacity-60">{checking ? "Checking…" : "Check domain"}</button></form></section> : null}

      {error ? <div className="rounded-3xl border border-red-300/20 bg-red-500/10 p-5 text-sm font-bold text-red-100">{error}</div> : null}

      {result ? <section className={`rounded-3xl border p-6 ${result.included ? "border-emerald-300/25 bg-emerald-500/10" : "border-white/10 bg-white/[0.04]"}`}><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Search result</p><h3 className="mt-2 text-2xl font-black">{result.domain}</h3><p className="mt-2 text-sm text-white/70">{result.message}</p><span className={`mt-4 inline-flex rounded-full px-4 py-2 text-xs font-black ${result.included ? "bg-emerald-400 text-emerald-950" : "border border-white/15 bg-white/[0.06] text-white/75"}`}>{result.included ? "Included with Partner Pro" : result.code === "domain_unavailable" ? "Unavailable" : result.code === "premium_domain" ? "Premium domain" : "Not eligible"}</span></section> : null}

      {result?.included && !claimedDomain ? <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/45">Domain owner information</p><h3 className="mt-2 text-xl font-black">Register {result.domain}</h3><p className="mt-2 text-sm leading-6 text-white/60">Enter the legal registrant contact for this domain. Review the details carefully before submitting.</p><form onSubmit={registerDomain} className="mt-5 grid gap-3 sm:grid-cols-2"><input required value={contact.first_name} onChange={(e) => setField("first_name", e.target.value)} placeholder="First name" className={inputClass} /><input required value={contact.last_name} onChange={(e) => setField("last_name", e.target.value)} placeholder="Last name" className={inputClass} /><input value={contact.org_name} onChange={(e) => setField("org_name", e.target.value)} placeholder="Business / organization (optional)" className={`${inputClass} sm:col-span-2`} /><input required value={contact.address1} onChange={(e) => setField("address1", e.target.value)} placeholder="Street address" className={`${inputClass} sm:col-span-2`} /><input value={contact.address2} onChange={(e) => setField("address2", e.target.value)} placeholder="Suite / unit (optional)" className={`${inputClass} sm:col-span-2`} /><input required value={contact.city} onChange={(e) => setField("city", e.target.value)} placeholder="City" className={inputClass} /><input required value={contact.state} onChange={(e) => setField("state", e.target.value)} placeholder="State / province" className={inputClass} /><input required value={contact.postal_code} onChange={(e) => setField("postal_code", e.target.value)} placeholder="Postal code" className={inputClass} /><input required maxLength={2} value={contact.country} onChange={(e) => setField("country", e.target.value.toUpperCase())} placeholder="Country code" className={inputClass} /><input required type="tel" value={contact.phone} onChange={(e) => setField("phone", e.target.value)} placeholder="Phone" className={inputClass} /><input required type="email" value={contact.email} onChange={(e) => setField("email", e.target.value)} placeholder="Email" className={inputClass} /><div className="sm:col-span-2 rounded-2xl border border-amber-300/15 bg-amber-300/[0.06] p-4 text-xs leading-5 text-amber-50/75">A successful registration consumes this location's one included-domain benefit.</div><button disabled={registering} className="sm:col-span-2 rounded-2xl bg-[#f5b700] px-6 py-3 text-sm font-black text-black disabled:opacity-60">{registering ? "Registering domain…" : `Register ${result.domain}`}</button></form></section> : null}

      {registrationMessage ? <section className="rounded-3xl border border-emerald-300/25 bg-emerald-500/10 p-6"><p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-100/70">Domain status</p><p className="mt-2 text-sm text-emerald-100/80">{registrationMessage}</p></section> : null}
    </div>
  );
}
