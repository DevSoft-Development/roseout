"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { createClient } from "@/lib/supabase-browser";

type SuccessState = {
  matchedExistingLocation: boolean;
  message: string;
  claimRequestId: string;
} | null;

const initialForm = {
  locationName: "",
  address: "",
  city: "",
  state: "",
  zipCode: "",
  phone: "",
  businessEmail: "",
  contactName: "",
  roleAtBusiness: "",
  website: "",
  planInterest: "free_discovery",
  notes: "",
};

export default function NoCodeClaimPage() {
  const supabase = useMemo(() => createClient(), []);
  const [form, setForm] = useState(initialForm);
  const [signedIn, setSignedIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SuccessState>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(Boolean(data.user));
      setForm((prev) => ({ ...prev, businessEmail: prev.businessEmail || data.user?.email || "" }));
    });
  }, [supabase]);

  function update(name: keyof typeof initialForm, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const res = await fetch("/api/business/claim/no-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError("Could not submit your claim. Check the required fields and try again.");
        return;
      }

      setSuccess(data);
    } catch {
      setError("Could not submit your claim. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#090909,#050505)]" />
        <div className="relative mx-auto max-w-5xl">
          <Link href="/business/claim" className="text-sm font-black text-white/45 transition hover:text-white">
            ← Back to claim options
          </Link>

          {success ? (
            <SuccessPanel success={success} signedIn={signedIn} />
          ) : (
            <div className="mt-8 grid gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">No-code business claim</p>
                <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl">Submit Your Location Claim</h1>
                <p className="mt-6 text-base leading-8 text-white/62 sm:text-lg">
                  Enter your business details once. We’ll check in the background to see if your location is already added to TheOutHaven, then place your claim in review.
                </p>
                <div className="mt-6 rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 text-sm leading-6 text-white/58">
                  This is a private submission flow. TheOutHaven does not show live results, possible matches, or management tools until an admin approves the claim.
                </div>
              </div>

              <form onSubmit={submit} className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 sm:p-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Location name" value={form.locationName} onChange={(value) => update("locationName", value)} required />
                  <Field label="Phone" value={form.phone} onChange={(value) => update("phone", value)} type="tel" required />
                  <Field label="Address" value={form.address} onChange={(value) => update("address", value)} required className="sm:col-span-2" />
                  <Field label="City" value={form.city} onChange={(value) => update("city", value)} required />
                  <Field label="State" value={form.state} onChange={(value) => update("state", value)} required />
                  <Field label="ZIP code" value={form.zipCode} onChange={(value) => update("zipCode", value)} required />
                  <Field label="Business email" value={form.businessEmail} onChange={(value) => update("businessEmail", value)} type="email" required />
                  <Field label="Contact name" value={form.contactName} onChange={(value) => update("contactName", value)} required />
                  <Field label="Role at business" value={form.roleAtBusiness} onChange={(value) => update("roleAtBusiness", value)} required />
                  <Field label="Website" value={form.website} onChange={(value) => update("website", value)} type="url" />
                  <label className="block">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Plan interest</span>
                    <select
                      value={form.planInterest}
                      onChange={(event) => update("planInterest", event.target.value)}
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none focus:border-[#e1062a]"
                    >
                      <option value="free_discovery">Free Discovery</option>
                      <option value="pro">Pro Plan with Reserve</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Notes</span>
                    <textarea
                      value={form.notes}
                      onChange={(event) => update("notes", event.target.value)}
                      rows={4}
                      className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                    />
                  </label>
                </div>

                {error && <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">{error}</div>}

                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-5 w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Submitting your claim..." : "Submit for Review"}
                </button>
              </form>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, required, type = "text", className = "" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {label}{required ? <span className="text-[#e1062a]"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
      />
    </label>
  );
}

function SuccessPanel({ success, signedIn }: { success: NonNullable<SuccessState>; signedIn: boolean }) {
  const matched = success.matchedExistingLocation;
  return (
    <section className="mx-auto mt-10 max-w-3xl rounded-[1.75rem] border border-emerald-400/25 bg-emerald-400/10 p-8 text-center">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200">Claim pending review</p>
      <h1 className="mt-4 text-3xl font-black sm:text-4xl">{matched ? "Location Already Added" : "Location Submitted for Review"}</h1>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-white/68">
        {matched
          ? "Good news — this location is already added to TheOutHaven. Your claim has been submitted and is pending review. Our team will verify your details before giving access to manage this location."
          : "We received your location details. Our team will review the information before adding or connecting this location to a business account."}
      </p>
      <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/business" className="rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white transition hover:bg-red-500">Back to Business</Link>
        {signedIn ? (
          <Link href="/locations/dashboard" className="rounded-2xl border border-white/15 bg-white/[0.05] px-6 py-4 text-sm font-black text-white/85 transition hover:bg-white hover:text-black">Go to Dashboard</Link>
        ) : (
          <Link href="/login?next=/business/claim" className="rounded-2xl border border-white/15 bg-white/[0.05] px-6 py-4 text-sm font-black text-white/85 transition hover:bg-white hover:text-black">Create Business Account</Link>
        )}
      </div>
    </section>
  );
}
