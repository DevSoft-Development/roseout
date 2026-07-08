"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TheOutHavenHeader from "@/components/TheOutHavenHeader";
import ClaimQrScanLauncher from "@/components/business/ClaimQrScanLauncher";
import ClientTurnstile from "@/components/security/ClientTurnstile";
import { formatFullAddress } from "@/lib/address-utils";
import { normalizeClaimCode } from "@/lib/claimQr";
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

type OwnerSignupState = {
  fullName: string;
  email: string;
  mobileNumber: string;
  zipCode: string;
  password: string;
  confirmPassword: string;
  agreeTerms: boolean;
  smsOptIn: boolean;
};

const emptyOwnerSignup: OwnerSignupState = {
  fullName: "",
  email: "",
  mobileNumber: "",
  zipCode: "",
  password: "",
  confirmPassword: "",
  agreeTerms: false,
  smsOptIn: false,
};

const inputClass = "mt-2 w-full rounded-2xl border border-white/10 bg-[#0d0d0d] px-4 py-4 text-sm font-bold text-white outline-none placeholder:text-white/25 focus:border-[#e1062a]";
const primaryButtonClass = "rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-500/25 transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60";

const errorCopy: Record<string, string> = {
  empty_code: "Enter a claim code to continue.",
  invalid_code: "We could not verify that code. Check the code and try again.",
  used_code: "This claim code has already been used.",
  redeemed_code: "This claim code has already been used.",
  location_claimed: "This location is already claimed. Contact support if you believe this is a mistake.",
  expired_code: "This claim code has expired. Contact TheOutHaven for a new code.",
  disabled_code: "This claim code is not active. Contact TheOutHaven for a new code.",
};

const passwordLabels = {
  minLength: "8+ characters",
  uppercase: "uppercase",
  lowercase: "lowercase",
  number: "number",
  special: "special character",
};

function passwordChecks(password: string) {
  return {
    minLength: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
}

function isClientTurnstileEnabled() {
  return String(process.env.NEXT_PUBLIC_TURNSTILE_ENABLED ?? "true").toLowerCase() !== "false";
}

function buildReturnPath(code: string) {
  const cleanCode = normalizeClaimCode(code);
  return `/business/claim${cleanCode ? `?code=${encodeURIComponent(cleanCode)}` : ""}`;
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function ClaimPageInner() {
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const codeFromUrl = normalizeClaimCode(searchParams.get("code") || "");

  const [claimCode, setClaimCode] = useState(codeFromUrl);
  const [location, setLocation] = useState<VerifiedLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [error, setError] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupMessage, setSignupMessage] = useState("");
  const [step, setStep] = useState<ClaimStep>(searchParams.get("submitted") === "pending" ? "submitted" : "verify");
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [signedInEmail, setSignedInEmail] = useState("");
  const [claimTurnstileToken, setClaimTurnstileToken] = useState("");
  const [signupTurnstileToken, setSignupTurnstileToken] = useState("");
  const [turnstileMessage, setTurnstileMessage] = useState("");
  const [claimTurnstileResetKey, setClaimTurnstileResetKey] = useState(0);
  const [signupTurnstileResetKey, setSignupTurnstileResetKey] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [ownerSignup, setOwnerSignup] = useState<OwnerSignupState>(emptyOwnerSignup);
  const [form, setForm] = useState({ businessEmail: "", businessPhone: "", roleAtBusiness: "", note: "" });

  const turnstileEnabled = useMemo(() => isClientTurnstileEnabled(), []);
  const returnPath = buildReturnPath(claimCode);
  const signInHref = `/login?next=${encodeURIComponent(returnPath)}`;
  const pass = useMemo(() => passwordChecks(ownerSignup.password), [ownerSignup.password]);
  const strongPassword = Object.values(pass).every(Boolean);

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      const email = data.user?.email || "";
      setIsSignedIn(Boolean(data.user));
      setSignedInEmail(email);
      setAuthChecked(true);
      setForm((prev) => ({ ...prev, businessEmail: prev.businessEmail || email }));
      setOwnerSignup((prev) => ({ ...prev, email: prev.email || email }));
    });
    return () => { active = false; };
  }, [supabase]);

  useEffect(() => {
    if (codeFromUrl) void verifyCode(codeFromUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeFromUrl]);

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

  async function refreshSignedInUser() {
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email || "";
    setIsSignedIn(Boolean(data.user));
    setSignedInEmail(email);
    setForm((prev) => ({ ...prev, businessEmail: prev.businessEmail || email }));
    return data.user;
  }

  async function signOutFromClaim() {
    await supabase.auth.signOut();
    setIsSignedIn(false);
    setSignedInEmail("");
    setStep("verify");
    setForm((prev) => ({ ...prev, businessEmail: "" }));
  }

  async function continueClaim() {
    setError("");
    if (!location) return;
    const user = await refreshSignedInUser();
    if (!user) {
      setError("Create your owner account or sign in to submit this claim.");
      return;
    }
    setStep("details");
  }

  async function createOwnerAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignupError("");
    setSignupMessage("");

    if (!location) return setSignupError("Verify your claim code first.");
    if (!ownerSignup.fullName.trim() || !ownerSignup.email.trim() || !ownerSignup.zipCode.trim()) {
      return setSignupError("Full name, email, and ZIP code are required.");
    }
    if (!strongPassword) return setSignupError("Please use a stronger password.");
    if (ownerSignup.password !== ownerSignup.confirmPassword) return setSignupError("Passwords do not match.");
    if (!ownerSignup.agreeTerms) return setSignupError("You must agree to the Terms of Use and Privacy Policy.");
    if (ownerSignup.mobileNumber.trim() && !ownerSignup.smsOptIn) return setSignupError("Please agree to SMS terms or remove the mobile number.");
    if (turnstileEnabled && !signupTurnstileToken) return setSignupError("Complete the security check before creating your account.");

    setCreatingAccount(true);
    try {
      const email = normalizeEmail(ownerSignup.email);
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: ownerSignup.fullName,
          email,
          password: ownerSignup.password,
          zip_code: ownerSignup.zipCode,
          mobile_number: ownerSignup.mobileNumber,
          sms_opt_in: Boolean(ownerSignup.mobileNumber.trim() && ownerSignup.smsOptIn),
          turnstileToken: signupTurnstileToken,
          next: returnPath,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setSignupError(data.error || "We could not create your owner account.");
        setSignupTurnstileToken("");
        setSignupTurnstileResetKey((key) => key + 1);
        return;
      }
      setSignupMessage("Check your email to verify your owner account. Your claim page is saved, so you do not need to rescan the QR code.");
    } catch {
      setSignupError("We could not create your owner account right now.");
      setSignupTurnstileToken("");
      setSignupTurnstileResetKey((key) => key + 1);
    } finally {
      setCreatingAccount(false);
    }
  }

  async function submitClaim(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!location) return setError("Verify your claim code before submitting a claim.");
    if (!form.businessEmail.trim() || !form.roleAtBusiness.trim()) return setError("Business email and role at business are required.");
    if (turnstileEnabled && !claimTurnstileToken) {
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
          turnstileToken: claimTurnstileToken,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorCopy[data.error] || (data.error === "auth_required" ? "Create your owner account or sign in to submit this claim." : "Could not submit claim request."));
        if (data.error === "auth_required") setIsSignedIn(false);
        setClaimTurnstileToken("");
        setClaimTurnstileResetKey((key) => key + 1);
        return;
      }
      setStep("submitted");
    } catch {
      setError("Could not submit claim request. Please try again.");
      setClaimTurnstileToken("");
      setClaimTurnstileResetKey((key) => key + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <TheOutHavenHeader />
      <section className="relative overflow-hidden px-4 pb-20 pt-24 sm:px-6 lg:px-8 lg:pt-32">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(225,6,42,0.24),transparent_32%),linear-gradient(180deg,#090909,#050505)]" />
        <div className="relative mx-auto grid max-w-7xl gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-start">
          <aside className="order-2 lg:order-1">
            <Link href="/business" className="text-sm font-black text-white/45 transition hover:text-white">← Back to business</Link>
            <p className="mt-8 text-xs font-black uppercase tracking-[0.35em] text-[#e1062a]">Business owner claim</p>
            <h1 className="mt-5 text-4xl font-black leading-tight tracking-tight sm:text-6xl">Claim Your Business Profile</h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-white/62 sm:text-lg sm:leading-8">
              Scan your QR code, confirm the location, create an owner account with a strong password, then submit your claim for review.
            </p>
            <div className="mt-8 grid gap-4">
              <InfoCard title="How claiming works" items={["Scan the QR code or enter the claim code.", "Confirm the matched location.", "Create your owner account with a strong password or sign in.", "Submit owner or manager details for review."]} />
              <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                <h2 className="text-lg font-black">Don’t have your postcard?</h2>
                <p className="mt-2 text-sm leading-6 text-white/55">If you lost your claim code or never received a postcard, request manual verification instead.</p>
                <Link href="/business/claim/no-code" className="mt-4 inline-flex rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-3 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-white hover:text-black">Request Manual Verification</Link>
              </article>
            </div>
          </aside>

          <section className="order-1 rounded-[2rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/40 sm:p-6 lg:order-2">
            {step === "submitted" ? <SubmittedState /> : (
              <>
                <div className="mb-5">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">Business owner claim</p>
                  <h2 className="mt-3 text-2xl font-black sm:text-3xl">Enter Your Claim Code</h2>
                  <p className="mt-2 text-sm leading-6 text-white/55">Your claim code is printed on the address label next to the QR code.</p>
                </div>

                {codeFromUrl ? <Notice tone="success">Claim code found from QR scan. Tap Verify Claim Code if it does not verify automatically.</Notice> : null}

                <form onSubmit={(event) => { event.preventDefault(); void verifyCode(); }} className="rounded-[1.5rem] border border-white/10 bg-black p-5">
                  <Field label="Claim code" value={claimCode} onChange={(value) => setClaimCode(normalizeClaimCode(value))} placeholder="Enter your claim code" mono />
                  <button type="submit" disabled={loading} className={`mt-4 w-full ${primaryButtonClass}`}>{loading ? "Verifying..." : "Verify Claim Code"}</button>
                </form>

                {error ? <Notice tone="error">{error}</Notice> : null}

                {location ? (
                  <LocationPreview
                    location={location}
                    authChecked={authChecked}
                    isSignedIn={isSignedIn}
                    signedInEmail={signedInEmail}
                    signInHref={signInHref}
                    onContinue={continueClaim}
                    onSignOut={signOutFromClaim}
                  >
                    {authChecked && !isSignedIn ? (
                      <OwnerAccountForm
                        state={ownerSignup}
                        setState={setOwnerSignup}
                        pass={pass}
                        strongPassword={strongPassword}
                        showPassword={showPassword}
                        setShowPassword={setShowPassword}
                        turnstileEnabled={turnstileEnabled}
                        turnstileToken={signupTurnstileToken}
                        setTurnstileToken={setSignupTurnstileToken}
                        resetKey={signupTurnstileResetKey}
                        loading={creatingAccount}
                        message={signupMessage}
                        error={signupError}
                        onSubmit={createOwnerAccount}
                        signInHref={signInHref}
                      />
                    ) : null}
                  </LocationPreview>
                ) : null}

                {step === "details" && location ? (
                  <form onSubmit={submitClaim} className="mt-6 rounded-[1.5rem] border border-white/10 bg-black p-5">
                    <p className="text-xs font-black uppercase tracking-[0.25em] text-[#e1062a]">Verify that you manage this business</p>
                    <h2 className="mt-3 text-2xl font-black">Submit your ownership details</h2>
                    <p className="mt-2 text-sm leading-6 text-white/50">TheOutHaven reviews owner or manager details before management access is approved.</p>
                    <div className="mt-5 grid gap-4">
                      <Field label="Business email" value={form.businessEmail} onChange={(value) => setForm((prev) => ({ ...prev, businessEmail: value }))} type="email" required />
                      <Field label="Business phone" value={form.businessPhone} onChange={(value) => setForm((prev) => ({ ...prev, businessPhone: value }))} type="tel" />
                      <Field label="Role at business" value={form.roleAtBusiness} onChange={(value) => setForm((prev) => ({ ...prev, roleAtBusiness: value }))} placeholder="Owner, general manager, marketing lead..." required />
                      <label className="block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">Optional note to TheOutHaven team</span><textarea value={form.note} onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))} rows={4} className={`${inputClass} resize-none`} /></label>
                    </div>
                    {turnstileEnabled ? (
                      <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                        <p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-white/40">Security check</p>
                        <ClientTurnstile action="business_claim_submit" theme="dark" resetKey={claimTurnstileResetKey} onToken={(token) => { setClaimTurnstileToken(token); setTurnstileMessage(""); }} onExpire={() => { setClaimTurnstileToken(""); setTurnstileMessage("Verification expired. Please complete it again."); }} onError={() => { setClaimTurnstileToken(""); setTurnstileMessage("Verification could not load. Refresh the page and try again."); }} />
                        {turnstileMessage ? <p className="mt-3 text-xs font-bold text-amber-100">{turnstileMessage}</p> : null}
                      </div>
                    ) : null}
                    <button type="submit" disabled={submitting || (turnstileEnabled && !claimTurnstileToken)} className={`mt-5 w-full ${primaryButtonClass}`}>{submitting ? "Submitting claim..." : turnstileEnabled && !claimTurnstileToken ? "Complete Verification to Submit" : "Submit for Review"}</button>
                  </form>
                ) : null}

                <div className="my-6 h-px bg-white/10" />
                <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
                  <p className="text-sm font-black text-white">Need to scan instead?</p>
                  <ClaimQrScanLauncher className="mt-3" buttonLabel="Open Camera Scanner" mode="inline" onCodeFound={(code) => { const normalized = normalizeClaimCode(code); setClaimCode(normalized); void verifyCode(normalized); }} />
                </div>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function InfoCard({ title, items }: { title: string; items: string[] }) {
  return <article className="rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl shadow-black/20"><h2 className="text-lg font-black">{title}</h2><ol className="mt-4 grid gap-3 text-sm leading-6 text-white/62">{items.map((item, index) => <li key={item} className="flex gap-3"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e1062a] text-xs font-black text-white">{index + 1}</span><span>{item}</span></li>)}</ol></article>;
}

function Notice({ children, tone }: { children: React.ReactNode; tone: "success" | "error" | "info" }) {
  const styles = tone === "success" ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-100" : tone === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-white/10 bg-white/[0.04] text-white/70";
  return <div className={`mt-5 rounded-2xl border p-4 text-sm font-bold leading-6 ${styles}`}>{children}</div>;
}

function LocationPreview({ location, authChecked, isSignedIn, signedInEmail, signInHref, onContinue, onSignOut, children }: { location: VerifiedLocation; authChecked: boolean; isSignedIn: boolean; signedInEmail: string; signInHref: string; onContinue: () => void; onSignOut: () => void; children?: React.ReactNode }) {
  const details = formatFullAddress({ address: location.address, city: location.borough || location.city, state: location.state, zip_code: location.zipCode, fallback: "" });
  const category = [location.locationType, location.primaryCategory].filter(Boolean).join(" • ");
  return <section className="mt-6 rounded-[1.5rem] border border-emerald-400/20 bg-emerald-400/10 p-5"><p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Location matched</p><h2 className="mt-3 text-2xl font-black">{location.name}</h2>{details ? <p className="mt-2 text-sm font-bold text-white/62">{details}</p> : null}{category ? <p className="mt-3 text-xs font-black uppercase tracking-[0.18em] text-[#e1062a]">{category}</p> : null}<dl className="mt-5 grid gap-3 sm:grid-cols-2"><PreviewItem label="Phone" value={location.phone || "Not listed"} /><PreviewItem label="Website" value={location.website || "Not listed"} /><PreviewItem label="Current claim status" value={location.claimStatus || "unclaimed"} /></dl>{authChecked && isSignedIn ? <div className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-4"><p className="text-sm font-black text-white">You are signed in on this device.</p>{signedInEmail ? <p className="mt-1 text-xs font-bold text-white/45">Signed in as {signedInEmail}</p> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={onContinue} className="rounded-2xl bg-white px-5 py-4 text-center text-sm font-black text-black transition hover:bg-rose-100">Continue Claim</button><button type="button" onClick={onSignOut} className="rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-center text-sm font-black text-white transition hover:bg-white hover:text-black">Sign out</button></div></div> : null}{authChecked && !isSignedIn ? children : null}{!authChecked ? <button type="button" disabled className="mt-5 w-full rounded-2xl bg-white px-6 py-4 text-sm font-black text-black opacity-60">Checking account...</button> : null}</section>;
}

function OwnerAccountForm({ state, setState, pass, strongPassword, showPassword, setShowPassword, turnstileEnabled, turnstileToken, setTurnstileToken, resetKey, loading, message, error, onSubmit, signInHref }: { state: OwnerSignupState; setState: React.Dispatch<React.SetStateAction<OwnerSignupState>>; pass: ReturnType<typeof passwordChecks>; strongPassword: boolean; showPassword: boolean; setShowPassword: React.Dispatch<React.SetStateAction<boolean>>; turnstileEnabled: boolean; turnstileToken: string; setTurnstileToken: (token: string) => void; resetKey: number; loading: boolean; message: string; error: string; onSubmit: (event: React.FormEvent<HTMLFormElement>) => void; signInHref: string }) {
  return <form onSubmit={onSubmit} className="mt-5 rounded-2xl border border-white/10 bg-black/35 p-4"><p className="text-sm font-black text-white">Create your owner account to submit this claim.</p><p className="mt-2 text-sm leading-6 text-white/58">Use a strong password to secure your business dashboard. After email verification, you will return to this same claim page without rescanning the QR code.</p>{message ? <Notice tone="success">{message}</Notice> : null}{error ? <Notice tone="error">{error}</Notice> : null}<div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Full name" value={state.fullName} onChange={(value) => setState((prev) => ({ ...prev, fullName: value }))} required /><Field label="Email" value={state.email} onChange={(value) => setState((prev) => ({ ...prev, email: value }))} type="email" required /><Field label="Mobile number optional" value={state.mobileNumber} onChange={(value) => setState((prev) => ({ ...prev, mobileNumber: value }))} type="tel" /><Field label="ZIP code" value={state.zipCode} onChange={(value) => setState((prev) => ({ ...prev, zipCode: value }))} required /><div><Field label="Password" value={state.password} onChange={(value) => setState((prev) => ({ ...prev, password: value }))} type={showPassword ? "text" : "password"} required /><button type="button" onClick={() => setShowPassword((value) => !value)} className="mt-2 text-xs font-black text-rose-100">{showPassword ? "Hide password" : "Show password"}</button></div><Field label="Confirm password" value={state.confirmPassword} onChange={(value) => setState((prev) => ({ ...prev, confirmPassword: value }))} type={showPassword ? "text" : "password"} required /></div><div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3"><p className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-white/40">Password strength</p><div className="flex flex-wrap gap-2">{Object.entries(pass).map(([key, valid]) => <span key={key} className={valid ? "rounded-full border border-[#e1062a]/70 bg-[#e1062a]/30 px-3 py-1.5 text-[11px] font-bold text-white" : "rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white/50"}>{passwordLabels[key as keyof typeof passwordLabels]}</span>)}</div>{!strongPassword ? <p className="mt-2 text-xs font-bold text-amber-100">Use all five items above before creating the account.</p> : null}</div><label className="mt-4 block text-sm leading-6 text-white/75"><input type="checkbox" checked={state.agreeTerms} onChange={(event) => setState((prev) => ({ ...prev, agreeTerms: event.target.checked }))} className="mr-2" />I agree to the <Link href="/terms" className="underline">Terms of Use</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</label><label className="mt-3 block text-xs leading-5 text-white/65"><input type="checkbox" checked={state.smsOptIn} onChange={(event) => setState((prev) => ({ ...prev, smsOptIn: event.target.checked }))} className="mr-2 align-top" />I agree to receive account updates and claim/reservation messages from TheOutHaven. Consent is not a condition of purchase. Message and data rates may apply.</label>{turnstileEnabled ? <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4"><p className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-white/40">Security check</p><ClientTurnstile action="signup" theme="dark" resetKey={resetKey} onToken={setTurnstileToken} onExpire={() => setTurnstileToken("")} onError={() => setTurnstileToken("")} /></div> : null}<button type="submit" disabled={loading || !strongPassword || (turnstileEnabled && !turnstileToken)} className={`mt-5 w-full ${primaryButtonClass}`}>{loading ? "Creating account..." : turnstileEnabled && !turnstileToken ? "Complete Verification to Create Account" : "Create owner account"}</button><p className="mt-4 text-center text-sm text-white/55">Already have an account? <Link href={signInHref} className="font-black text-rose-100 underline">Sign in to continue</Link></p></form>;
}

function PreviewItem({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-black/35 p-4"><dt className="text-[10px] font-black uppercase tracking-[0.2em] text-white/35">{label}</dt><dd className="mt-2 break-words text-sm font-bold text-white/75">{value}</dd></div>;
}

function Field({ label, value, onChange, placeholder, required, type = "text", mono = false }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; type?: string; mono?: boolean }) {
  return <label className="block"><span className="text-xs font-black uppercase tracking-[0.2em] text-white/40">{label}{required ? <span className="text-[#e1062a]"> *</span> : null}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} className={`${inputClass} ${mono ? "font-mono uppercase tracking-[0.14em]" : ""}`} /></label>;
}

function SubmittedState() {
  return <section className="rounded-[1.5rem] border border-emerald-400/25 bg-emerald-400/10 p-6 text-center"><p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-200">Claim request submitted</p><h2 className="mt-4 text-3xl font-black">Claim Submitted for Review</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/62">Your claim code was verified and your claim is now pending review. TheOutHaven will confirm your business details before giving access to manage this location.</p><div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/business" className="rounded-2xl bg-[#e1062a] px-6 py-4 text-sm font-black text-white transition hover:bg-red-500">Back to Business</Link><Link href="/locations/dashboard" className="rounded-2xl border border-white/15 bg-white/[0.05] px-6 py-4 text-sm font-black text-white/85 transition hover:bg-white hover:text-black">Go to Dashboard</Link></div></section>;
}

export default function BusinessClaimPage() {
  return <Suspense fallback={<main className="min-h-screen bg-black pt-32 text-center text-white">Loading claim flow...</main>}><ClaimPageInner /></Suspense>;
}
