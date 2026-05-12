"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Script from "next/script";

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

export default function ForgotPasswordPage() {
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null | undefined>(null);

  const [email, setEmail] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const renderTurnstile = () => {
    const turnstile = (window as TurnstileWindow).turnstile;

    if (!turnstileRef.current || !turnstile || widgetIdRef.current) return;

    const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

    if (!siteKey) {
      setError("Missing Turnstile site key.");
      return;
    }

    widgetIdRef.current = turnstile.render(turnstileRef.current, {
      sitekey: siteKey,
      theme: "light",
      callback: (token: string) => {
        setCaptchaToken(token);
        setError("");
      },
      "expired-callback": () => setCaptchaToken(null),
      "error-callback": () => {
        setCaptchaToken(null);
        setError("Verification failed. Please try again.");
      },
    });
  };

  const showCaptcha = () => {
    setCaptchaRequired(true);
    setTimeout(renderTurnstile, 100);
  };

  const resetCaptcha = () => {
    const turnstile = (window as TurnstileWindow).turnstile;
    setCaptchaToken(null);

    if (turnstile && widgetIdRef.current) {
      turnstile.reset(widgetIdRef.current);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!email.trim()) {
      setError("Please enter your email address.");
      return;
    }

    if (captchaRequired && !captchaToken) {
      setError("Please complete the verification.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/password-reset/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          captchaToken,
        }),
      });

      const result = await response.json();

      if (result.captchaRequired) {
        showCaptcha();
        resetCaptcha();
        setMessage(
          result.message || "If an account exists, we sent a reset link."
        );
        return;
      }

      setMessage(
        result.message || "If an account exists, we sent a reset link."
      );
      setEmail("");
      resetCaptcha();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      resetCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#050505] px-6 text-white">
      {captchaRequired && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
          onLoad={renderTurnstile}
        />
      )}

      <form
        onSubmit={handleReset}
        className="w-full max-w-md rounded-[2rem] bg-white p-8 text-black shadow-2xl"
      >
        <p className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-yellow-600">
          TheOutHaven Admin
        </p>

        <h1 className="text-3xl font-extrabold">Forgot Password</h1>

        <p className="mt-2 text-sm text-neutral-500">
          Enter your email and we’ll send a password reset link if an account
          exists.
        </p>

        {error && (
          <div className="mt-5 rounded-2xl bg-red-100 p-4 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div className="mt-5 rounded-2xl bg-green-100 p-4 text-sm font-semibold text-green-700">
            {message}
          </div>
        )}

        <label className="mt-6 block text-sm font-bold">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full rounded-2xl border border-neutral-300 px-4 py-3 outline-none focus:border-yellow-500"
        />

        {captchaRequired && (
          <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
            <p className="mb-3 text-sm font-semibold text-neutral-600">
              Please complete this verification before requesting another link.
            </p>
            <div ref={turnstileRef} />
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-full bg-yellow-500 px-6 py-4 font-extrabold text-black disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Sending..." : "Send Reset Link"}
        </button>

        <Link
          href="/login"
          className="mt-5 block text-center text-sm font-bold text-neutral-600 hover:text-black"
        >
          Back to Login
        </Link>
      </form>
    </main>
  );
}
