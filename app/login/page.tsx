"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";
import TurnstileWidget from "@/components/auth/TurnstileWidget";

type Tab = "signin" | "signup";
type SignupStep = 1 | 2;

type SignupState = {
  full_name: string;
  email: string;
  mobile_number: string;
  zip_code: string;
  password: string;
  confirm_password: string;
  promo_code: string;
  outing_preferences: string[];
  budget_range: string;
  preferred_areas: string[];
  venue_preferences: string[];
  age_range: string;
  nightlife_frequency: string;
  interested_in_member_perks: boolean;
};

const inputClass =
  "min-h-[56px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white placeholder:text-white/45";
const selectClass =
  "min-h-[56px] w-full appearance-none rounded-2xl border border-white/10 bg-[#1a1411] px-4 text-white";
const primaryButtonClass =
  "inline-flex items-center justify-center rounded-full bg-[#e1062a] px-6 py-3 text-sm font-bold text-white shadow-2xl shadow-red-950/40 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-70";
const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-sm font-bold text-white transition hover:border-[#e1062a]/55 hover:bg-[#e1062a]/15";

const initialSignupState: SignupState = {
  full_name: "",
  email: "",
  mobile_number: "",
  zip_code: "",
  password: "",
  confirm_password: "",
  promo_code: "",
  outing_preferences: [],
  budget_range: "",
  preferred_areas: [],
  venue_preferences: [],
  age_range: "",
  nightlife_frequency: "",
  interested_in_member_perks: false,
};

const passwordChecks = (p: string) => ({
  minLength: p.length >= 8,
  uppercase: /[A-Z]/.test(p),
  lowercase: /[a-z]/.test(p),
  number: /\d/.test(p),
  special: /[^A-Za-z0-9]/.test(p),
});

const passwordLabels: Record<keyof ReturnType<typeof passwordChecks>, string> = {
  minLength: "8+ CHARACTERS",
  uppercase: "UPPERCASE",
  lowercase: "LOWERCASE",
  number: "NUMBER",
  special: "SPECIAL",
};

const normalizeEmail = (email: string) => email.trim().toLowerCase();

export default function LoginPage({ initialTab = "signin" }: { initialTab?: Tab }) {
  const supabase = createClient();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [signupStep, setSignupStep] = useState<SignupStep>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [signin, setSignin] = useState({ email: "", password: "" });
  const [signup, setSignup] = useState<SignupState>(initialSignupState);
  const [turnstileToken, setTurnstileToken] = useState("");

  const pass = useMemo(() => passwordChecks(signup.password), [signup.password]);
  const strong = Object.values(pass).every(Boolean);
  const mobileProvided = signup.mobile_number.trim().length > 0;

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    const normalizedEmail = normalizeEmail(signin.email);
    const intendedRoute = sanitizeIntendedPath(
      new URL(window.location.href).searchParams.get("next"),
    );

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: normalizedEmail,
          password: signin.password,
          next: intendedRoute,
        }),
      });

      const data = await response.json().catch(() => null);

      console.log("THEOUTHAVEN_SIGN_IN_RESULT", {
        ok: response.ok,
        status: response.status,
        redirectTo: data?.redirectTo,
        adminRole: data?.adminRole,
        profileRole: data?.profileRole,
        profileAccountType: data?.profileAccountType,
        isLocationOwner: data?.isLocationOwner,
        debug: data?.debug,
      });

      if (!response.ok || !data?.ok) {
        setLoading(false);
        setError(data?.message || "We could not sign you in. Please try again.");
        return;
      }

      window.location.replace(data.redirectTo || "/create");
    } catch (error) {
      console.error("Sign in failed", error);
      setLoading(false);
      setError("We could not sign you in. Please check your connection and try again.");
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!strong) return setError("Please use a stronger password.");
    if (signup.password !== signup.confirm_password) return setError("Passwords do not match.");
    if (!agreeTerms) return setError("You must agree to the Terms of Use and Privacy Policy.");
    if (mobileProvided && !smsOptIn) {
      return setError("Please agree to SMS messaging terms to receive text updates.");
    }
    setLoading(true);
    const normalizedSignupEmail = normalizeEmail(signup.email);
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: signup.full_name,
          email: normalizedSignupEmail,
          password: signup.password,
          zip_code: signup.zip_code,
          mobile_number: signup.mobile_number,
          sms_opt_in: mobileProvided ? smsOptIn : false,
          turnstileToken,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        setLoading(false);
        return setError(data.error || "We could not create your account.");
      }
      window.location.replace(`/signup/check-email?email=${encodeURIComponent(normalizedSignupEmail)}`);
    } catch {
      setLoading(false);
      setError("We could not create your account right now.");
    }
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-28 text-white">
      <section className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.2),transparent_32%),linear-gradient(180deg,#17100d,#0f0a08)] p-8 shadow-2xl shadow-black/40">
          <p className="inline-flex rounded-full border border-[#e1062a]/45 bg-[#e1062a]/15 px-4 py-2 text-xs font-semibold tracking-[0.2em] text-red-100 shadow-[0_0_24px_rgba(225,6,42,0.25)]">THEOUTHAVEN</p>
          <h1 className="mt-6 text-4xl font-semibold leading-tight">Plan better OUTings.<br />Discover better places.</h1>
          <p className="mt-4 max-w-xl text-white/75">Create your free account to save favorites, unlock smarter outing recommendations, and discover restaurants, activities, and experiences matched to your vibe.</p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-lg font-medium">Create User Account</h3>
              <p className="mt-2 text-sm text-white/70">Save favorites, get recommendations, and plan better outings.</p>
              <button
                type="button"
                onClick={() => {
                  setTab("signup");
                  setSignupStep(1);
                  setError("");
                  setMessage("");
                }}
                className={`mt-4 w-full ${primaryButtonClass}`}
              >
                Create Free Account
              </button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-lg font-medium">Sign Up for Business</h3>
              <p className="mt-2 text-sm text-white/70">Claim your location, manage reservations, and reach more customers.</p>
              <button type="button" onClick={() => router.push("/location/apply")} className={`mt-4 w-full ${primaryButtonClass}`}>Apply for Business</button>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              ["Curated", "Restaurants + experiences"],
              ["Personalized", "Outings by vibe"],
              ["Premium", "Member-ready planning"],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <p className="text-sm font-bold text-white">{title}</p>
                <p className="mt-1 text-xs leading-5 text-white/55">{body}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3 text-xs text-white/70">
            <span className="rounded-full border border-white/10 px-3 py-1.5">1000+ locations</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">Curated outings</span>
            <span className="rounded-full border border-white/10 px-3 py-1.5">Member perks</span>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.16),transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5 shadow-2xl shadow-black/40">
          <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          <div className="mb-6 grid grid-cols-2 rounded-full border border-white/10 bg-black/50 p-1 shadow-inner shadow-black/40">
            <button
              type="button"
              onClick={() => {
                setTab("signin");
                setError("");
                setMessage("");
              }}
              className={`rounded-full px-4 py-3 text-sm font-bold transition ${
                tab === "signin"
                  ? "bg-[#e1062a] text-white shadow-[0_0_24px_rgba(225,6,42,0.35)]"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              Sign In
            </button>

            <button
              type="button"
              onClick={() => {
                setTab("signup");
                setSignupStep(1);
                setError("");
                setMessage("");
              }}
              className={`rounded-full px-4 py-3 text-sm font-bold transition ${
                tab === "signup"
                  ? "bg-[#e1062a] text-white shadow-[0_0_24px_rgba(225,6,42,0.35)]"
                  : "text-white/55 hover:bg-white/[0.06] hover:text-white"
              }`}
            >
              Sign Up
            </button>
          </div>

          <div className="mb-6">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#e1062a]">
              {tab === "signin" ? "Sign In" : "Sign Up"}
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {tab === "signin" ? "Sign in to your TheOutHaven account" : "Create your TheOutHaven account"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/60">
              {tab === "signin"
                ? "Access saved places, outing plans, member perks, and smarter recommendations."
                : "Save favorites, personalize recommendations, and unlock a better way to discover restaurants and experiences."}
            </p>
          </div>

          {error && (
            <p className="mb-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}
          {message && (
            <p className="mb-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              {message}
            </p>
          )}

          {tab === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">Email</label>
                <input
                  required
                  type="email"
                  placeholder="you@example.com"
                  value={signin.email}
                  onChange={(e) => setSignin((s) => ({ ...s, email: e.target.value }))}
                  onBlur={(e) => setSignin((s) => ({ ...s, email: normalizeEmail(e.target.value) }))}
                  className={inputClass}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-xs font-bold uppercase tracking-[0.18em] text-white/45">Password</label>
                  <div className="flex items-center gap-3">
                    <Link href="/forgot-password" className="text-xs font-bold text-[#e1062a] transition hover:text-red-300">
                      Forgot password?
                    </Link>
                    <Link href="/auth/create-password" className="text-xs font-bold text-white/70 transition hover:text-white">
                      Resend setup link
                    </Link>
                  </div>
                </div>
                <input
                  required
                  type="password"
                  placeholder="Enter your password"
                  value={signin.password}
                  onChange={(e) => setSignin((s) => ({ ...s, password: e.target.value }))}
                  className={inputClass}
                />
              </div>

              <button type="submit" disabled={loading} className={`w-full ${primaryButtonClass}`}>{loading ? "Signing In..." : "Sign In"}</button>

              <p className="text-center text-sm text-white/55">
                Need an account?{" "}
                <button
                  type="button"
                  onClick={() => {
                    setTab("signup");
                    setSignupStep(1);
                    setError("");
                    setMessage("");
                  }}
                  className="font-bold text-[#e1062a] hover:text-red-300"
                >
                  Sign up now
                </button>
              </p>
            </form>
          ) : (
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Account creation</p>
                <p className="mt-1 text-sm text-white/60">Create a free account to save your outings and get 3 searches per week.</p>
              </div>
              <div className="hidden grid gap-2 rounded-2xl border border-white/10 bg-black/25 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <div
                  className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold tracking-wide transition ${
                    signupStep === 1
                      ? "border-[#e1062a]/50 bg-[#e1062a] text-white shadow-[0_0_18px_rgba(225,6,42,0.45)]"
                      : "border-white/10 bg-white/[0.04] text-white/50"
                  }`}
                >
                  Step 1: Account Basics
                </div>
                <div className="hidden h-px bg-white/10 sm:block" />
                <div
                  className={`inline-flex items-center justify-center rounded-full border px-4 py-2 text-xs font-semibold tracking-wide transition ${
                    signupStep === 2
                      ? "border-[#e1062a]/50 bg-[#e1062a] text-white shadow-[0_0_18px_rgba(225,6,42,0.45)]"
                      : "border-white/10 bg-white/[0.04] text-white/50"
                  }`}
                >
                  Step 2: Preferences
                </div>
              </div>
              {true ? (
                <>
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">Step 1</p>
                    <h3 className="mt-1 text-lg font-semibold text-white">Account details</h3>
                    <p className="mt-1 text-sm text-white/55">
                      Tell us who you are so we can personalize your outing recommendations.
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">Full Name</label>
                      <input required placeholder="Full name" value={signup.full_name} onChange={(e) => setSignup((s) => ({ ...s, full_name: e.target.value }))} className="sm:col-span-2 min-h-[56px] rounded-2xl border border-white/10 bg-white/5 px-4 text-white" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">Email</label>
                      <input required type="email" placeholder="Email" value={signup.email} onChange={(e) => setSignup((s) => ({ ...s, email: e.target.value }))} onBlur={(e) => setSignup((s) => ({ ...s, email: normalizeEmail(e.target.value) }))} className="sm:col-span-2 min-h-[56px] rounded-2xl border border-white/10 bg-white/5 px-4 text-white" />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">Mobile Number (Optional)</label>
                      <input placeholder="Mobile number" value={signup.mobile_number} onChange={(e) => setSignup((s) => ({ ...s, mobile_number: e.target.value }))} className={inputClass} />
                    </div>
                    <div>
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">ZIP Code</label>
                      <input required placeholder="ZIP code" value={signup.zip_code} onChange={(e) => setSignup((s) => ({ ...s, zip_code: e.target.value }))} className={inputClass} />
                    </div>
                    <div className="space-y-3 sm:col-span-2">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">Password</label>
                          <input required type="password" placeholder="Password" value={signup.password} onChange={(e) => setSignup((s) => ({ ...s, password: e.target.value }))} className={inputClass} />
                        </div>
                        <div>
                          <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">Confirm Password</label>
                          <input required type="password" placeholder="Confirm password" value={signup.confirm_password} onChange={(e) => setSignup((s) => ({ ...s, confirm_password: e.target.value }))} className={inputClass} />
                        </div>
                      </div>
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(pass).map(([key, isValid]) => (
                            <p
                              key={key}
                              className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold tracking-wide ${
                                isValid
                                  ? "border-[#e1062a]/70 bg-[#e1062a]/30 text-white shadow-[0_0_14px_rgba(225,6,42,0.28)]"
                                  : "border-white/10 bg-white/5 text-white/50"
                              }`}
                            >
                              {passwordLabels[key as keyof typeof passwordLabels]}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-white/45">Promo Code (Optional)</label>
                      <input placeholder="Promo code" value={signup.promo_code} onChange={(e) => setSignup((s) => ({ ...s, promo_code: e.target.value }))} className="sm:col-span-2 min-h-[56px] rounded-2xl border border-white/10 bg-white/5 px-4 text-white" />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                  <select className={selectClass}><option>Typical outing budget</option></select>
                  <select className={selectClass}><option>Age range</option></select>
                  <select className={selectClass}><option>How often do you go out</option></select>
                </div>
              )}

              <label className="block text-sm">
                <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} className="mr-2" />
                I agree to the <Link href="/terms" className="underline">Terms of Use</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
              </label>

              <label className="block text-xs leading-relaxed text-white/75">
                <input type="checkbox" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} className="mr-2 align-top" />
                By checking this box, I agree to receive recurring automated text messages from TheOutHaven, including account updates, reservation alerts, recommendations, promotions, and offers at the mobile number I provided. Consent is not a condition of purchase. Message frequency varies. Message and data rates may apply. Reply STOP to opt out and HELP for help. View our <Link href="/terms" className="underline">Terms of Use</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.
              </label>

              <TurnstileWidget onToken={setTurnstileToken} />

              <div className="flex gap-2">
                {signupStep === 2 && <button type="button" onClick={() => setSignupStep(1)} className={`flex-1 ${secondaryButtonClass}`}>Back</button>}
                <button type="submit" disabled={loading} className={`flex-1 ${primaryButtonClass}`}>{loading ? "Creating..." : "Create Account"}</button>
              </div>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
