"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import { createClient } from "@/lib/supabase-browser";

type VerifiedLocation = {
  id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  borough?: string | null;
  state?: string | null;
  zipCode?: string | null;
  locationType?: string | null;
  primaryCategory?: string | null;
  phone?: string | null;
  website?: string | null;
  claimStatus?: string | null;
};

type ClaimStep = "verify" | "details" | "submitted";

const errorCopy: Record<string, string> = {
  empty_code: "Enter a claim code to continue.",
  invalid_code: "We could not verify that code. Check the code and try again.",
  used_code: "This claim code has already been used.",
  redeemed_code: "This claim code has already been used.",
  location_claimed: "This location is already claimed. Contact support if you believe this is a mistake.",
  expired_code: "This claim code has expired. Contact TheOutHaven for a new code.",
  disabled_code: "This claim code is not active. Contact TheOutHaven for a new code.",
};

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function ClaimPageInner() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const codeFromUrl = normalizeCode(searchParams.get("code") || "");
  const [claimCode, setClaimCode] = useState(codeFromUrl);
  const [location, setLocation] = useState<VerifiedLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<ClaimStep>(searchParams.get("submitted") === "pending" ? "submitted" : "verify");
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [form, setForm] = useState({
    businessEmail: "",
    businessPhone: "",
    roleAtBusiness: "",
    note: "",
  });

  const returnPath = `/business/claim${claimCode ? `?code=${encodeURIComponent(claimCode)}` : ""}`;

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsSignedIn(Boolean(data.user));
      setForm((prev) => ({
        ...prev,
        businessEmail: prev.businessEmail || data.user?.email || "",
      }));
    });
  }, [supabase]);

  async function verifyCode(nextCode = claimCode) {
    const code = normalizeCode(nextCode);
    setClaimCode(code);
    setError("");
    setLocation(null);
    setStep("verify");

    if (!code) {
      setError(errorCopy.empty_code);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/business/claim-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(errorCopy[data.error] || errorCopy.invalid_code);
        return;
      }

      setLocation(data.location);
    } catch {
      setError(errorCopy.invalid_code);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (codeFromUrl) verifyCode(codeFromUrl);
    // Run only when a QR/manual URL first provides a claim code.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

  async function continueClaim() {
    setError("");
    if (!location) return;

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      window.location.href = `/login?next=${encodeURIComponent(returnPath)}`;
      return;
    }

    setIsSignedIn(true);
    setForm((prev) => ({ ...prev, businessEmail: prev.businessEmail || data.user?.email || "" }));
    setStep("details");
  }

  async function submitClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!location) {
      setError("Verify your claim code before submitting a claim.");
      return;
    }

    if (!form.businessEmail.trim() || !form.roleAtBusiness.trim()) {
      setError("Business email and role at business are required.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/business/claim-code/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: claimCode,
          businessEmail: form.businessEmail,
          businessPhone: form.businessPhone,
          roleAtBusiness: form.roleAtBusiness,
          note: form.note,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(errorCopy[data.error] || (data.error === "auth_required" ? "Sign in or sign up to continue your claim." : data.error === "missing_details" ? "Business email and role at business are required." : "Could not submit claim request."));
        return;
      }

      setStep("submitted");
    } catch {
      setError("Could not submit claim request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#090909,#050505)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <Link href="/business" className="text-sm font-black text-white/45 transition hover:text-white">
              ← Back to business
            </Link>
            <p className="mt-8 text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
              Business owner claim
            </p>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-5xl md:text-6xl">
              Claim Your Location
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-8 text-white/62 sm:text-lg">
              Use your claim QR or printed claim code to connect a request to your location, or submit your business details once for a private review by TheOutHaven.
            </p>

            <div className="mt-8 grid gap-4">
              <OptionCard
                title="Scan QR Code"
                text="Use the QR code from your TheOutHaven claim mailer to start a pending review request."
                cta="Scan QR Code"
                href="/business/claim/scan"
              />
              <OptionCard
                title="Enter Claim Code"
                text="Enter the printed claim code to verify the location connected to your request. Ownership remains pending until TheOutHaven approves it."
                cta="Enter Code"
                href="#claim-code"
              />
              <OptionCard
                title="I Don’t Have a Code"
                text="Didn’t receive a TheOutHaven claim mailer? Submit your business details and we’ll match your location in the background. If your location is already added, your claim will be connected for review."
                cta="Submit My Location"
                href="/business/claim/no-code"
              />
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 sm:p-6">
            {step === "submitted" ? (
              <SubmittedState />
            ) : (
              <>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    verifyCode();
                  }}
                  className="rounded-[1.5rem] border border-white/10 bg-black p-5"
                >
                  <label className="block" htmlFor="claim-code">
                    <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
                      Claim code
                    </span>
                    <input
                      id="claim-code"
                      value={claimCode}
                      onChange={(event) => setClaimCode(normalizeCode(event.target.value))}
                      placeholder="Enter your claim code"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 font-mono text-sm font-black uppercase tracking-[0.14em] text-white outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-white/25 focus:border-[#e1062a]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Verifying..." : "Verify"}
                  </button>
                </form>

                {error && (
                  <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                    {error}
                  </div>
                )}

                {location && (
                  <LocationPreview location={location} onContinue={continueClaim} isSignedIn={isSignedIn} />
                )}

                {step === "details" && location && (
                  <form onSubmit={submitClaim} className="mt-6 rounded-[1.5rem] border border-white/10 bg-black p-5">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                      Verify that you manage this business
                    </p>
                    <h2 className="mt-3 text-2xl font-black">Submit your ownership details</h2>
                    <p className="mt-2 text-sm leading-6 text-white/50">
                      The claim code confirms you have the postcard. Sign-in is required so TheOutHaven can place your request in review before any management access is granted.
                    </p>
                    <div className="mt-5 grid gap-4">
                      <Field label="Business email" value={form.businessEmail} onChange={(value) => setForm((prev) => ({ ...prev, businessEmail: value }))} type="email" required />
                      <Field label="Business phone" value={form.businessPhone} onChange={(value) => setForm((prev) => ({ ...prev, businessPhone: value }))} type="tel" />
                      <Field label="Role at business" value={form.roleAtBusiness} onChange={(value) => setForm((prev) => ({ ...prev, roleAtBusiness: value }))} placeholder="Owner, general manager, marketing lead..." required />
                      <label className="block">
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Optional note to TheOutHaven team</span>
                        <textarea
                          value={form.note}
                          onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                          rows={4}
                          className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
                        />
                      </label>
                    </div>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="mt-5 w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Submitting claim..." : "Submit for Review"}
                    </button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function OptionCard({ title, text, cta, href }: { title: string; text: string; cta: string; href: string }) {
  return (
    <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
      <h2 className="text-lg font-black">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-white/55">{text}</p>
      <Link href={href} className="mt-4 inline-flex rounded-full bg-white px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-black transition hover:bg-rose-100">
        {cta}
      </Link>
    </article>
  );
}

function LocationPreview({ location, onContinue, isSignedIn }: { location: VerifiedLocation; onContinue: () => void; isSignedIn: boolean }) {
  const details = [location.address, location.borough || location.city, location.state, location.zipCode].filter(Boolean).join(", ");
  const category = [location.locationType, location.primaryCategory].filter(Boolean).join(" • ");

  return (
    <section className="mt-6 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-5">
      <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Location matched</p>
      <h2 className="mt-3 text-2xl font-black">{location.name}</h2>
      {details && <p className="mt-2 text-sm font-bold text-white/62">{details}</p>}
      {category && <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-[#e1062a]">{category}</p>}
      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
        <PreviewItem label="Phone" value={location.phone || "Not listed"} />
        <PreviewItem label="Website" value={location.website || "Not listed"} />
        <PreviewItem label="Current claim status" value={location.claimStatus || "unclaimed"} />
      </dl>
      <button
        type="button"
        onClick={onContinue}
        className="mt-5 w-full rounded-2xl bg-white px-6 py-4 text-sm font-black text-black transition hover:bg-rose-100"
      >
        {isSignedIn ? "Continue Claim" : "Continue Claim — Sign in or sign up"}
      </button>
    </section>
  );
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 p-4">
      <dt className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">{label}</dt>
      <dd className="mt-2 break-words text-sm font-bold text-white/75">{value}</dd>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">
        {label}{required ? <span className="text-[#e1062a]"> *</span> : null}
      </span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]"
      />
    </label>
  );
}

function SubmittedState() {
  return (
    <section className="rounded-[1.5rem] border border-emerald-400/25 bg-emerald-400/10 p-6 text-center">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200">Claim request submitted</p>
      <h2 className="mt-4 text-3xl font-black">Claim Submitted for Review</h2>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/62">
        Your claim code was verified and your claim is now pending review. TheOutHaven will confirm your business details before giving access to manage this location.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link href="/business" className="rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white transition hover:bg-red-500">
          Back to Business
        </Link>
        <Link href="/locations/dashboard" className="rounded-2xl border border-white/15 bg-white/[0.05] px-6 py-4 text-sm font-black text-white/85 transition hover:bg-white hover:text-black">
          Go to Dashboard
        </Link>
      </div>
    </section>
  );
}

export default function BusinessClaimPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-black pt-32 text-center text-white">Loading claim flow...</main>}>
      <ClaimPageInner />
    </Suspense>
  );
}
