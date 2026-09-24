"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { type TurnstileInstance } from "@marsidev/react-turnstile";
import { TurnstileWidget } from "@/components/auth/TurnstileWidget";

function formatCountdown(seconds: number) {
  const safe = Math.max(0, seconds);
  return `00:${String(safe).padStart(2, "0")}`;
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const turnstileRef = useRef<TurnstileInstance | null>(null);

  useEffect(() => {
    const initialEmail = new URL(window.location.href).searchParams.get("email");
    if (initialEmail) setEmail(initialEmail.trim().toLowerCase());
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setTimeout(() => {
      setCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [cooldownSeconds]);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage("");
    setError("");

    if (cooldownSeconds > 0) return;
    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }
    if (!captchaToken) {
      setError("Please complete the security check.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), captchaToken }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.success === false) {
        setError(data.error || "We could not send the password reset email.");
        return;
      }

      const nextCooldown = Math.max(0, Number(data.cooldownSeconds || 60));
      setCooldownSeconds(nextCooldown);
      setMessage(
        data.passwordResetEmailSent === true
          ? "Password reset email sent. Check your inbox."
          : "If an account exists for this email, a password reset email has been requested."
      );
      turnstileRef.current?.reset();
      setCaptchaToken(null);
    } catch (err: any) {
      setError(err?.message || "We could not send the password reset email.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      <form onSubmit={handleReset} className="w-full max-w-md rounded-[2rem] bg-white p-8 text-black shadow-2xl">
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-yellow-600">
          TheOutHaven Account Recovery
        </p>
        <h1 className="text-3xl font-extrabold">Forgot / Reset Password</h1>
        <p className="mt-2 text-sm text-neutral-500">
          Enter your account email and we’ll send you a secure password reset link.
        </p>

        {error ? (
          <div className="mt-5 rounded-2xl bg-red-100 p-4 text-sm font-semibold text-red-700">{error}</div>
        ) : null}

        {message ? (
          <div className="mt-5 rounded-2xl bg-green-100 p-4 text-sm font-semibold text-green-700">
            <p>{message}</p>
            {cooldownSeconds > 0 ? (
              <p className="mt-2 font-bold">You can send another email in {formatCountdown(cooldownSeconds)}.</p>
            ) : (
              <p className="mt-2 font-bold">You can send another email now.</p>
            )}
          </div>
        ) : null}

        <label className="mt-6 block text-sm font-bold">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-yellow-500"
        />

        <div className="mt-6">
          <TurnstileWidget onTokenChange={setCaptchaToken} turnstileRef={turnstileRef} />
        </div>

        <button
          type="submit"
          disabled={loading || cooldownSeconds > 0 || !captchaToken}
          className="mt-6 w-full rounded-full bg-yellow-500 px-6 py-4 font-extrabold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading
            ? "Sending..."
            : cooldownSeconds > 0
              ? `Send again in ${formatCountdown(cooldownSeconds)}`
              : message
                ? "Send Reset Email Again"
                : "Send Reset Email"}
        </button>

        <Link href="/login" className="mt-5 block text-center text-sm font-bold text-neutral-600 hover:text-black">
          Back to Login
        </Link>
      </form>
    </main>
  );
}
