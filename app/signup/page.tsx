"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";
import { createClient } from "@/lib/supabase-browser";
import { isStrongPassword, strongPasswordMessage } from "@/lib/password-policy";

type TurnstileWindow = Window & {
  turnstile?: {
    render: (
      element: HTMLElement,
      options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
        theme?: "light" | "dark" | "auto";
      }
    ) => string | undefined;
    reset: (widgetId?: string) => void;
  };
};

export default function SignupPage() {
  const supabase = createClient();

  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null | undefined>(null);

  const [step, setStep] = useState<1 | 2>(1);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [planningFor, setPlanningFor] = useState("");
  const [city, setCity] = useState("");
  const [preferredVibe, setPreferredVibe] = useState("");
  const [budgetRange, setBudgetRange] = useState("");

  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);

  const [captchaToken, setCaptchaToken] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const hasMinLength = password.length >= 12;
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSymbol = /[^A-Za-z0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  const isPasswordValid = isStrongPassword(password);

  const canGoStep2 =
    fullName.trim() &&
    email.trim() &&
    isPasswordValid &&
    passwordsMatch &&
    acceptedTerms;

  const canSubmit = canGoStep2 && captchaToken && !loading;

  const renderTurnstile = () => {
    const turnstile = (window as TurnstileWindow).turnstile;

    if (!turnstileRef.current || !turnstile || widgetIdRef.current) return;

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    if (!siteKey) {
      setErrorMessage("Missing Turnstile site key.");
      return;
    }

    widgetIdRef.current = turnstile.render(turnstileRef.current, {
      sitekey: siteKey,
      theme: "dark",
      callback: (token: string) => {
        setCaptchaToken(token);
        setErrorMessage("");
      },
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => {
        setCaptchaToken(null);
        setErrorMessage("Verification failed. Please try again.");
      },
    });
  };

  useEffect(() => {
    if (step === 2) {
      setTimeout(renderTurnstile, 100);
    }
  }, [step]);

  const resetCaptcha = () => {
    const turnstile = (window as TurnstileWindow).turnstile;
    setCaptchaToken(null);

    if (turnstile && widgetIdRef.current) {
      turnstile.reset(widgetIdRef.current);
    }
  };

  const handleNextStep = () => {
    setErrorMessage("");

    if (!fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (!isPasswordValid) {
      setErrorMessage(
        `Password must include: ${strongPasswordMessage()}.`
      );
      return;
    }

    if (!passwordsMatch) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    if (!acceptedTerms) {
      setErrorMessage("Please agree to the Terms of Service and Privacy Policy.");
      return;
    }

    setStep(2);
  };

  const handleSignup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setErrorMessage("");

    if (!canGoStep2) {
      setStep(1);
      setErrorMessage("Please complete your account details first.");
      return;
    }

    if (smsOptIn && !phone.trim()) {
      setErrorMessage("Please enter your phone number to receive SMS messages.");
      return;
    }

    if (!captchaToken) {
      setErrorMessage("Please complete the verification.");
      return;
    }

    setLoading(true);

    try {
      const captchaResponse = await fetch("/api/verify-captcha", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: captchaToken }),
      });

      const captchaResult = await captchaResponse.json();

      if (!captchaResponse.ok || !captchaResult.success) {
        setErrorMessage(
          captchaResult.error || "Captcha verification failed. Please try again."
        );
        resetCaptcha();
        setLoading(false);
        return;
      }

      const userEmail = email.trim().toLowerCase();

      const { error } = await supabase.auth.signInWithOtp({
        email: userEmail,
        options: {
          shouldCreateUser: true,
          data: {
            full_name: fullName.trim(),
            role: "user",
            phone: phone.trim() || null,
            planning_for: planningFor || null,
            city: city.trim() || null,
            preferred_vibe: preferredVibe || null,
            budget_range: budgetRange || null,
            marketing_opt_in: marketingOptIn,
            sms_opt_in: smsOptIn,
            sms_consent_text: smsOptIn
              ? "I agree to receive SMS messages from TheOutHaven about account updates, outing recommendations, reminders, promotions, and offers. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Reply HELP for help. Consent is not a condition of purchase."
              : null,
            sms_consent_date: smsOptIn ? new Date().toISOString() : null,
          },
        },
      });

      if (error) {
        setErrorMessage(error.message);
        resetCaptcha();
        setLoading(false);
        return;
      }

      sessionStorage.setItem(
        "theouthaven_pending_signup",
        JSON.stringify({
          email: userEmail,
          password,
        })
      );

      window.location.href = `/verify?email=${encodeURIComponent(userEmail)}`;
    } catch {
      setErrorMessage("Something went wrong. Please try again.");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen overflow-y-auto bg-black px-6 py-5 text-white">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        async
        defer
        onLoad={() => {
          if (step === 2) renderTurnstile();
        }}
      />

      <div className="mx-auto flex min-h-[calc(100vh-40px)] max-w-7xl flex-col">
        <header className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="text-sm font-black uppercase tracking-[0.55em] text-red-400"
          >
            TheOutHaven
          </Link>

          <Link
            href="/login"
            className="rounded-full border border-white/15 bg-white/5 px-5 py-2 text-sm font-bold text-white hover:bg-white hover:text-black"
          >
            Log in
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-8 lg:grid-cols-[1fr_500px]">
          <div className="hidden lg:block">
            <div className="mb-4 inline-flex rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.28em] text-red-300">
              Curated by TheOutHaven AI
            </div>

            <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-tight text-white xl:text-6xl">
              Curated outings, made effortless.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/55">
              From breakfast dates to late-night reservations, TheOutHaven helps you
              discover polished restaurants, activities, and experiences that
              match your mood, budget, and style.
            </p>

            <div className="mt-6 grid max-w-3xl gap-3 md:grid-cols-3">
              {[
                ["01", "Tell us the kind of outing you want."],
                ["02", "Personalize your vibe, city, and budget."],
                ["03", "Unlock better AI-powered recommendations."],
              ].map(([num, text]) => (
                <div
                  key={num}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <p className="text-xl font-black text-red-400">{num}</p>
                  <p className="mt-2 text-xs leading-5 text-white/50">{text}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-white/10 bg-[#0b0b0b]/95 shadow-2xl shadow-black/60 backdrop-blur-xl">
            <div className="border-b border-white/10 bg-[#0b0b0b]/95 px-5 py-3 backdrop-blur-xl">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-red-400">
                Step {step} of 2
              </p>

              <h2 className="mt-1 text-2xl font-black text-white">
                {step === 1 ? "Create your account" : "Set your preferences"}
              </h2>

              <div className="mt-3 flex gap-2">
                <div className="h-2 flex-1 rounded-full bg-red-600" />
                <div
                  className={`h-2 flex-1 rounded-full ${
                    step >= 2 ? "bg-red-600" : "bg-white/15"
                  }`}
                />
              </div>
            </div>

            {step === 1 ? (
              <div className="space-y-3 p-6">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-red-500"
                />

                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-red-500"
                />

                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-red-500"
                />

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-red-500"
                />

                <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs">
                  <p className={hasMinLength ? "text-emerald-400" : "text-white/35"}>
                    ✓ At least 12 characters
                  </p>
                  <p className={hasUppercase ? "text-emerald-400" : "text-white/35"}>
                    ✓ One uppercase letter
                  </p>
                  <p className={hasLowercase ? "text-emerald-400" : "text-white/35"}>
                    ✓ One lowercase letter
                  </p>
                  <p className={hasNumber ? "text-emerald-400" : "text-white/35"}>
                    ✓ One number
                  </p>
                  <p className={hasSymbol ? "text-emerald-400" : "text-white/35"}>
                    ✓ One symbol
                  </p>
                  <p className={passwordsMatch ? "text-emerald-400" : "text-white/35"}>
                    ✓ Passwords match
                  </p>
                </div>

                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-3 text-xs text-white/55">
                  <input
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-red-600"
                  />
                  <span>
                    I agree to the{" "}
                    <Link href="/terms" className="font-bold text-red-300 hover:text-white">
                      Terms of Service
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="font-bold text-red-300 hover:text-white">
                      Privacy Policy
                    </Link>
                    .
                  </span>
                </label>

                {errorMessage && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-100">
                    {errorMessage}
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleNextStep}
                  className="w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-red-950/40 hover:bg-red-500"
                >
                  Continue
                </button>
              </div>
            ) : (
              <form onSubmit={handleSignup} className="space-y-2 p-4">
                <select
                  value={planningFor}
                  onChange={(e) => setPlanningFor(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-white outline-none focus:border-red-500"
                >
                  <option value="">What are you planning?</option>
                  <option value="date_nights">Date</option>
                  <option value="breakfast">Breakfast or brunch</option>
                  <option value="friends">Going out with friends</option>
                  <option value="solo">Solo outing</option>
                  <option value="family">Family outing</option>
                  <option value="events">Events & experiences</option>
                </select>

                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="City or borough, example: Queens"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-red-500"
                />

                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Phone number for SMS updates (optional)"
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-white outline-none placeholder:text-white/30 focus:border-red-500"
                />

                <select
                  value={preferredVibe}
                  onChange={(e) => setPreferredVibe(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-white outline-none focus:border-red-500"
                >
                  <option value="">Preferred vibe</option>
                  <option value="romantic">Romantic</option>
                  <option value="upscale">Upscale</option>
                  <option value="casual_chic">Casual chic</option>
                  <option value="fun">Fun & energetic</option>
                  <option value="cozy">Cozy</option>
                  <option value="quiet">Quiet</option>
                  <option value="trendy">Trendy</option>
                </select>

                <select
                  value={budgetRange}
                  onChange={(e) => setBudgetRange(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/60 px-4 py-2.5 text-white outline-none focus:border-red-500"
                >
                  <option value="">Budget range</option>
                  <option value="budget">$</option>
                  <option value="moderate">$$</option>
                  <option value="premium">$$$</option>
                  <option value="luxury">$$$$</option>
                </select>

                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-2.5 text-xs text-white/55">
                  <input
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => setMarketingOptIn(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-red-600"
                  />
                  <span>
                    Send me TheOutHaven updates, recommendations, and offers by email.
                  </span>
                </label>

                <label className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/40 p-2.5 text-[10px] leading-4 text-white/55">
                  <input
                    type="checkbox"
                    checked={smsOptIn}
                    onChange={(e) => setSmsOptIn(e.target.checked)}
                    className="mt-1 h-4 w-4 accent-red-600"
                  />
                  <span>
                    I agree to receive SMS messages from{" "}
                    <strong className="text-white">TheOutHaven</strong> about
                    account updates, outing recommendations, reminders,
                    promotions, and offers. Message frequency varies. Message
                    and data rates may apply. Reply{" "}
                    <strong className="text-white">STOP</strong> to opt out.
                    Reply <strong className="text-white">HELP</strong> for help.
                    Consent is not a condition of purchase. View our{" "}
                    <Link href="/privacy" className="font-bold text-red-300 hover:text-white">
                      Privacy Policy
                    </Link>{" "}
                    and{" "}
                    <Link href="/terms" className="font-bold text-red-300 hover:text-white">
                      Terms
                    </Link>
                    .
                  </span>
                </label>

                <div className="rounded-xl border border-white/10 bg-black/40 p-2.5">
                  <div ref={turnstileRef} />
                </div>

                {errorMessage && (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-100">
                    {errorMessage}
                  </div>
                )}

                <div className="flex gap-3 pb-1">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="w-1/3 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-black uppercase tracking-[0.18em] text-white hover:bg-white hover:text-black"
                  >
                    Back
                  </button>

                  <button
                    type="submit"
                    disabled={!canSubmit}
                    className="w-2/3 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-red-950/40 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading ? "Sending Code..." : "Send Verification Code"}
                  </button>
                </div>
              </form>
            )}

            <p className="pb-4 text-center text-xs text-white/40">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-red-300 hover:text-white">
                Log in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}