"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import ClaimQrScanLauncher from "@/components/business/ClaimQrScanLauncher";
import ClientTurnstile from "@/components/security/ClientTurnstile";
import { normalizeClaimCode } from "@/lib/claimQr";
import { createClient } from "@/lib/supabase-browser";
import { formatFullAddress } from "@/lib/address-utils";

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

function isClientTurnstileEnabled() {
  return String(process.env.NEXT_PUBLIC_TURNSTILE_ENABLED ?? "true").toLowerCase() !== "false";
}

const errorCopy: Record<string, string> = {
  empty_code: "Enter a claim code to continue.",
  invalid_code: "We could not verify that code. Check the code and try again.",
  used_code: "This claim code has already been used.",
  redeemed_code: "This claim code has already been used.",
  location_claimed: "This location is already claimed. Contact support if you believe this is a mistake.",
  expired_code: "This claim code has expired. Contact TheOutHaven for a new code.",
  disabled_code: "This claim code is not active. Contact TheOutHaven for a new code.",
};

function buildReturnPath(code: string) {
  const cleanCode = normalizeClaimCode(code);
  return `/business/claim${cleanCode ? `?code=${encodeURIComponent(cleanCode)}` : ""}`;
}

function claimAuthHref(path: "/login" | "/signup", code: string) {
  return `${path}?next=${encodeURIComponent(buildReturnPath(code))}`;
}

function ClaimPageInner() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const codeFromUrl = normalizeClaimCode(searchParams.get("code") || "");
  const [claimCode, setClaimCode] = useState(codeFromUrl);
  const [location, setLocation] = useState<VerifiedLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState<ClaimStep>(searchParams.get("submitted") === "pending" ? "submitted" : "verify");
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileMessage, setTurnstileMessage] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [form, setForm] = useState({
    businessEmail: "",
    businessPhone: "",
    roleAtBusiness: "",
    note: "",
  });

  const turnstileEnabled = useMemo(() => isClientTurnstileEnabled(), []);
  const returnPath = buildReturnPath(claimCode);
  const signInHref = claimAuthHref("/login", claimCode);
  const signUpHref = claimAuthHref("/signup", claimCode);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setIsSignedIn(Boolean(data.user));
      setAuthChecked(true);
      setForm((prev) => ({
        ...prev,
        businessEmail: prev.businessEmail || data.user?.email || "",
      }));
    });
    return () => {
      active = false;
    };
  }, [supabase]);

  async function verifyCode(nextCode = claimCode) {
    const code = normalizeClaimCode(nextCode);
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
      setIsSignedIn(false);
      setError("Create your free owner account or sign in to submit this claim.");
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

    if (turnstileEnabled && !turnstileToken) {
      setTurnstileMessage("Complete the quick verification before submitting your claim.");
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
          turnstileToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          errorCopy[data.error] ||
            (data.error === "auth_required"
              ? "Create your free owner account or sign in to submit this claim."
              : data.error === "missing_details"
                ? "Business email and role at business are required."
                : "Could not submit claim request."),
        );
        if (data.error === "auth_required") setIsSignedIn(false);
        if (turnstileEnabled) {
          setTurnstileToken("");
          setTurnstileResetKey((current) => current + 1);
        }
        return;
      }

      setStep("submitted");
    } catch {
      setError("Could not submit claim request. Please try again.");
      if (turnstileEnabled) {
        setTurnstileToken("");
        setTurnstileResetKey((current) => current + 1);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 lg:px-8 lg:pt-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#090909,#050505)]" />
        <div className="relative mx-auto mb-6 max-w-7xl lg:hidden">
          <Link href="/business" className="text-sm font-black text-white/45 transition hover:text-white">
            ← Back to business
          </Link>
          <p className="mt-7 text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
            Business owner claim
          </p>
          <h1 className="mt-4 text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            Claim Your Business Profile
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-white/62 sm:text-lg sm:leading-8">
            Scan your QR code, confirm the location, then create or sign in to your owner account on the same flow.
          </p>
        </div>
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <div className="order-2 lg:order-1">
            <div className="hidden lg:block">
              <Link href="/business" className="text-sm font-black text-white/45 transition hover:text-white">
                ← Back to business
              </Link>
              <p className="mt-8 text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">
                Business owner claim
              </p>
              <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight sm:text-5xl md:text-6xl">
                Claim Your Business Profile
              </h1>
              <p className="mt-5 max-w-2xl text-sm leading-7 text-white/62 sm:text-lg sm:leading-8">
                Start with your QR or claim code. You can create a free owner account or sign in without leaving the claim flow.
              </p>
            </div>

            <div className="mt-6 grid gap-4 lg:mt-8">
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20">
                <h2 className="text-lg font-black">How claiming works</h2>
                <ol className="mt-4 grid gap-3 text-sm leading-6 text-white/62">
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-xs font-black text-white">1</span>
                    <span>Scan the QR code or enter the claim code printed on your label.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-xs font-black text-white">2</span>
                    <span>Confirm the matched location before submitting anything.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-xs font-black text-white">3</span>
                    <span>Create your free owner account or sign in to protect the listing.</span>
                  </li>
                  <li className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-xs font-black text-white">4</span>
                    <span>Submit owner or manager details for TheOutHaven review.</span>
                  </li>
                </ol>
              </article>

              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-lg font-black">Don’t have your postcard?</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">
                  If you lost your claim code or never received a postcard, request manual verification instead.
                </p>
                <Link href="/business/claim/no-code" className="mt-4 inline-flex w-full justify-center rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white hover:text-black sm:w-auto">
                  Request Manual Verification
                </Link>
              </article>
            </div>
          </div>

          <div className="order-1 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 sm:p-6 lg:order-2">
            {step === "submitted" ? (
              <SubmittedState />
            ) : (
              <>
                <div className="mb-5">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                    Business owner claim
                  </p>
                  <h2 className="mt-3 text-2xl font-black sm:text-3xl">Enter Your Claim Code</h2>
                  <p className="mt-2 text-sm leading-6 text-white/55">
                    Your claim code is printed on the address label next to the QR code.
                  </p>
                </div>

                {codeFromUrl && (
                  <div className="mb-5 rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-sm font-bold leading-6 text-emerald-100">
                    Claim code found from QR scan. Tap Verify Claim Code if it does not verify automatically.
                  </div>
                )}

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
                      onChange={(event) => setClaimCode(normalizeClaimCode(event.target.value))}
                      placeholder="Enter your claim code"
                      className="mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 font-mono text-sm font-black uppercase tracking-[0.14em] text-white outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-white/25 focus:border-[#e1062a]"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-4 w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Verifying..." : "Verify Claim Code"}
                  </button>
                </form>

                {error && (
                  <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-200">
                    {error}
                  </div>
                )}

                {location && (
                  <LocationPreview
                    location={location}
                    onContinue={continueClaim}
                    isSignedIn={isSignedIn}
                    authChecked={authChecked}
                    signInHref={signInHref}
                    signUpHref={signUpHref}
                  />
                )}

                {step === "details" && location && (
                  <form onSubmit={submitClaim} className="mt-6 rounded-[1.5rem] border border-white/10 bg-black p-5">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">
                      Verify that you manage this business
                    </p>
                    <h2 className="mt-3 text-2xl font-black">Submit your ownership details</h2>
                    <p className="mt-2 text-sm leading-6 text-white/50">
                      Your claim code verifies the location match. TheOutHaven reviews owner or manager details before management access is approved.
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
                    {turnstileEnabled ? (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-white/40">Security check</p>
                        <ClientTurnstile
                          action="business_claim_submit"
                          theme="dark"
                          resetKey={turnstileResetKey}
                          onToken={(token) => {
                            setTurnstileToken(token);
                            setTurnstileMessage("");
                          }}
                          onExpire={() => {
                            setTurnstileToken("");
                            setTurnstileMessage("Verification expired. Please complete it again.");
                          }}
                          onError={() => {
                            setTurnstileToken("");
                            setTurnstileMessage("Verification could not load. Refresh the page and try again.");
                          }}
                        />
                        {turnstileMessage ? <p className="mt-3 text-xs font-bold text-amber-100">{turnstileMessage}</p> : null}
                      </div>
                    ) : null}
                    <button
                      type="submit"
                      disabled={submitting || (turnstileEnabled && !turnstileToken)}
                      className="mt-5 w-full rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Submitting claim..." : turnstileEnabled && !turnstileToken ? "Complete Verification to Submit" : "Submit for Review"}
                    </button>
                  </form>
                )}

                <div className="my-6 h-px bg-white/10" />
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                  <p className="text-sm font-black text-white">Need to scan instead?</p>
                  <ClaimQrScanLauncher
                    className="mt-3"
                    buttonLabel="Open Camera Scanner"
                    mode="inline"
                    onCodeFound={(code) => {
                      const normalized = normalizeClaimCode(code);
                      setClaimCode(normalized);
                      verifyCode(normalized);
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

function LocationPreview({
  location,
  onContinue,
  isSignedIn,
  authChecked,
  signInHref,
  signUpHref,
}: {
  location: VerifiedLocation;
  onContinue: () => void;
  isSignedIn: boolean;
  authChecked: boolean;
  signInHref: string;
  signUpHref: string;
}) {
  const details = formatFullAddress({
    address: location.address,
    city: location.borough || location.city,
    state: location.state,
    zip_code: location.zipCode,
    fallback: "",
  });
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

      {authChecked && !isSignedIn ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-4">
          <p className="text-sm font-black text-white">Create your owner account to submit this claim.</p>
          <p className="mt-2 text-sm leading-6 text-white/58">
            To protect business listings, claims must be connected to a TheOutHaven account. After signup or sign-in, you will return to this same claim page with the code preserved.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link href={signUpHref} className="rounded-2xl bg-white px-5 py-4 text-center text-sm font-black text-black transition hover:bg-rose-100">
              Create owner account
            </Link>
            <Link href={signInHref} className="rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-center text-sm font-black text-white transition hover:bg-white hover:text-black">
              Sign in to continue
            </Link>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onContinue}
          disabled={!authChecked}
          className="mt-5 w-full rounded-2xl bg-white px-6 py-4 text-sm font-black text-black transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {authChecked ? "Continue Claim" : "Checking account..."}
        </button>
      )}
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
