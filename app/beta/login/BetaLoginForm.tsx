"use client";

import { useCallback, useState } from "react";
import TurnstileWidget from "@/components/security/TurnstileWidget";

const inputClass =
  "min-h-[54px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 text-white outline-none placeholder:text-white/40 transition focus:border-rose-300/50 focus:bg-white/[0.07] focus:ring-2 focus:ring-rose-500/20";
const buttonClass =
  "inline-flex min-h-[52px] w-full items-center justify-center rounded-full bg-rose-600 px-6 py-3 text-sm font-black text-white shadow-2xl shadow-rose-950/35 transition hover:-translate-y-0.5 hover:bg-rose-500 disabled:cursor-not-allowed disabled:translate-y-0 disabled:bg-white/15 disabled:text-white/45 disabled:shadow-none";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export default function BetaLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [turnstileMessage, setTurnstileMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const resetTurnstile = useCallback((message = "Please complete the verification again.") => {
    setTurnstileToken("");
    setTurnstileMessage(message);
    setTurnstileResetKey((value) => value + 1);
  }, []);

  const handleTurnstileToken = useCallback((token: string) => {
    setTurnstileToken(token);
    if (token) setTurnstileMessage("");
  }, []);

  const handleTurnstileExpire = useCallback(() => {
    resetTurnstile("Verification expired. Please try again.");
  }, [resetTurnstile]);

  const handleTurnstileError = useCallback(() => {
    resetTurnstile("Verification failed. Please try again.");
  }, [resetTurnstile]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setTurnstileMessage("");

    if (!turnstileToken) {
      setTurnstileMessage("Please complete the verification before logging in.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: normalizeEmail(email),
          password,
          next: "/user/dashboard/beta",
          turnstileToken,
          turnstileAction: "beta-login",
          requireTurnstile: true,
          source: "beta-login",
        }),
      });

      const data = await response.json().catch(() => null);

      if (process.env.NODE_ENV !== "production") {
        console.log("BETA_LOGIN_RESULT", {
          ok: response.ok,
          status: response.status,
          redirectTo: data?.redirectTo,
          message: data?.message,
        });
      }

      if (!response.ok || !data?.ok) {
        setError(data?.message || "We could not sign you in. Please try again.");
        resetTurnstile();
        setLoading(false);
        return;
      }

      const redirectTo = typeof data?.redirectTo === "string" && data.redirectTo
        ? data.redirectTo
        : "/user/dashboard/beta";

      window.location.replace(redirectTo);
      return;
    } catch (err) {
      console.error("Beta sign in failed", err);
      setError("We could not sign you in. Please check your connection and try again.");
      resetTurnstile();
      setLoading(false);
    }
  }

  const disabled = loading || !email.trim() || !password || !turnstileToken;

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error ? <div className="rounded-2xl border border-rose-300/25 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-100">{error}</div> : null}
      <label className="block text-sm font-bold text-white/85">
        Email
        <input className={`${inputClass} mt-2`} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required />
      </label>
      <label className="block text-sm font-bold text-white/85">
        Password
        <div className="relative mt-2"><input className={`${inputClass} pr-20`} type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" required /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-2 top-1/2 min-h-11 -translate-y-1/2 rounded-full px-3 text-xs font-black text-rose-100">{showPassword ? "Hide" : "Show"}</button></div>
      </label>
      <div className="space-y-2">
        <TurnstileWidget
          action="beta-login"
          theme="dark"
          resetKey={turnstileResetKey}
          onToken={handleTurnstileToken}
          onExpire={handleTurnstileExpire}
          onError={handleTurnstileError}
          className="flex min-h-[70px] items-center justify-center rounded-2xl border border-white/10 bg-black/20 p-3"
        />
        {turnstileMessage ? <p className="text-sm font-semibold text-amber-100">{turnstileMessage}</p> : null}
      </div>
      <button type="submit" disabled={disabled} className={buttonClass}>{loading ? "Logging in…" : "Log in to beta"}</button>
    </form>
  );
}
