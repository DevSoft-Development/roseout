"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";
import { isStrongPassword, strongPasswordMessage } from "@/lib/password-policy";

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-black text-white">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-red-400">
            Loading verification...
          </p>
        </main>
      }
    >
      <VerifyPageContent />
    </Suspense>
  );
}

function VerifyPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const emailFromUrl = searchParams.get("email") || "";

  const [email, setEmail] = useState(emailFromUrl);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState(
    "We sent a verification code to your email."
  );

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("theouthaven_pending_signup");

      if (saved) {
        const parsed = JSON.parse(saved);

        window.setTimeout(() => {
          if (parsed?.email && !email) {
            setEmail(parsed.email);
          }

          if (parsed?.password) {
            setPassword(parsed.password);
          }
        }, 0);
      }
    } catch {
      // ignore
    }
  }, [email]);

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();

    setError("");
    setMessage("");

    if (!email.trim() || !code.trim()) {
      setError("Please enter your email and verification code.");
      return;
    }

    setLoading(true);

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim().toLowerCase(),
        token: code.trim(),
        type: "email",
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      if (password) {
        if (!isStrongPassword(password)) {
          setError(`Password must include: ${strongPasswordMessage()}.`);
          return;
        }

        await supabase.auth.updateUser({ password });
      }

      sessionStorage.removeItem("theouthaven_pending_signup");

      router.replace("/login?verified=1");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    setError("");
    setMessage("");

    if (!email.trim()) {
      setError("Enter your email first.");
      return;
    }

    setResending(true);

    try {
      const { error: resendError } = await supabase.auth.signInWithOtp({
        email: email.trim().toLowerCase(),
        options: {
          shouldCreateUser: true,
        },
      });

      if (resendError) {
        setError(resendError.message);
        return;
      }

      setMessage("A new verification code was sent.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not resend code.");
    } finally {
      setResending(false);
    }
  }

  return (
    <main className="min-h-screen bg-black px-6 py-5 text-white">
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
              Email Verification
            </div>

            <h1 className="max-w-3xl text-5xl font-black leading-[0.95] tracking-tight text-white xl:text-6xl">
              Confirm your account.
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-white/55">
              Enter the verification code sent to your email to activate your
              TheOutHaven account.
            </p>
          </div>

          <form
            onSubmit={verifyCode}
            className="rounded-[1.5rem] border border-white/10 bg-[#0b0b0b]/95 p-6 shadow-2xl shadow-black/60 backdrop-blur-xl"
          >
            <p className="text-xs font-bold uppercase tracking-[0.28em] text-red-400">
              Verify Email
            </p>

            <h2 className="mt-1 text-2xl font-black text-white">
              Enter your code
            </h2>

            <p className="mt-2 text-sm leading-6 text-white/50">
              Check your inbox for the code from TheOutHaven.
            </p>

            {message && (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
                {message}
              </div>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-100">
                {error}
              </div>
            )}

            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
              className="mt-5 w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-red-500"
            />

            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Verification code"
              inputMode="numeric"
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/60 px-4 py-3 text-white outline-none placeholder:text-white/30 focus:border-red-500"
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-5 w-full rounded-xl bg-red-600 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white shadow-lg shadow-red-950/40 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify Account"}
            </button>

            <button
              type="button"
              onClick={resendCode}
              disabled={resending}
              className="mt-3 w-full rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black uppercase tracking-[0.18em] text-white hover:bg-white hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              {resending ? "Sending..." : "Resend Code"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}