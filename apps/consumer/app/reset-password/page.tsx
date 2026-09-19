"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

const OFFICIAL_RESET_ORIGIN = "https://www.theouthaven.com";
const OFFICIAL_RESET_PATH = "/reset-password";

function shouldRedirectToOfficialHost(hostname: string) {
  return (
    hostname !== "www.theouthaven.com" &&
    hostname !== "theouthaven.com" &&
    hostname !== "localhost" &&
    hostname !== "127.0.0.1"
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!shouldRedirectToOfficialHost(window.location.hostname)) return;

    window.location.replace(
      `${OFFICIAL_RESET_ORIGIN}${OFFICIAL_RESET_PATH}${window.location.search}${window.location.hash}`,
    );
  }, []);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    setMessage("");
    setError("");

    if (!password || !confirmPassword) {
      setError("Please enter and confirm your new password.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      if (!token) {
        setError("This reset link is invalid or expired. Please request a new reset email.");
        return;
      }

      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.success) {
        setError(result.error || "Password could not be updated.");
        return;
      }

      setMessage("Password updated successfully. Redirecting to login...");

      setTimeout(() => {
        router.replace("/login");
      }, 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#070303] px-5 py-10 text-white sm:px-6 lg:px-8">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_12%_16%,rgba(225,6,42,0.34),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(255,244,229,0.14),transparent_26%),linear-gradient(135deg,#080303_0%,#1a0708_48%,#070303_100%)]" />
      <div className="absolute left-[8%] top-20 -z-10 h-[26rem] w-[26rem] rounded-full bg-[#e1062a]/20 blur-3xl" />
      <div className="absolute bottom-0 right-[6%] -z-10 h-[24rem] w-[24rem] rounded-full bg-white/10 blur-3xl" />

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-6xl items-center justify-center">
        <div className="grid w-full overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/[0.06] shadow-2xl shadow-black/30 backdrop-blur lg:grid-cols-[0.92fr_1.08fr]">
          <section className="relative hidden min-h-[38rem] flex-col justify-between overflow-hidden bg-[linear-gradient(155deg,#1a0708,#070303_70%)] p-10 lg:flex">
            <div className="absolute right-[-6rem] top-[-6rem] h-64 w-64 rounded-full bg-[#e1062a]/25 blur-3xl" />
            <div className="absolute bottom-[-7rem] left-[-7rem] h-72 w-72 rounded-full bg-white/10 blur-3xl" />

            <div className="relative z-10">
              <p className="inline-flex rounded-full border border-[#e1062a]/35 bg-[#e1062a]/15 px-4 py-2 text-xs font-black uppercase tracking-[0.24em] text-red-100">
                TheOutHaven Account
              </p>
              <h1 className="mt-8 text-5xl font-black leading-[0.95] tracking-[-0.06em]">
                Reset your password securely.
              </h1>
              <p className="mt-6 max-w-sm text-base leading-7 text-white/62">
                Use the recovery link from your email to create a new password and get back to
                managing your TheOutHaven account.
              </p>
            </div>

            <div className="relative z-10 rounded-[1.5rem] border border-white/10 bg-white/[0.07] p-5">
              <p className="text-xs font-black uppercase tracking-[0.22em] text-rose-200">
                Secure reset
              </p>
              <p className="mt-3 text-sm leading-6 text-white/60">
                This page only accepts active TheOutHaven reset links. If your link expired, request a
                fresh reset email from the login page.
              </p>
            </div>
          </section>

          <form onSubmit={handleUpdatePassword} className="bg-[#fff8f1] p-6 text-[#17110f] sm:p-8 lg:p-10">
            <Link
              href="/"
              className="inline-flex text-xs font-black uppercase tracking-[0.24em] text-[#e1062a] hover:text-red-700"
            >
              TheOutHaven
            </Link>

            <h2 className="mt-8 text-4xl font-black tracking-[-0.05em] sm:text-5xl">
              Create a new password
            </h2>
            <p className="mt-4 text-sm leading-6 text-[#17110f]/58">
              Enter and confirm a new password with at least 8 characters.
            </p>

            {error && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                {message}
              </div>
            )}

            <label className="mt-8 block text-sm font-black">New Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter new password"
              className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 font-bold outline-none transition focus:border-[#e1062a] focus:ring-4 focus:ring-[#e1062a]/10"
            />

            <label className="mt-5 block text-sm font-black">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="mt-2 h-12 w-full rounded-2xl border border-black/10 bg-white px-4 font-bold outline-none transition focus:border-[#e1062a] focus:ring-4 focus:ring-[#e1062a]/10"
            />

            <button
              type="submit"
              disabled={loading}
              className="mt-7 w-full rounded-full bg-[#e1062a] px-6 py-4 text-sm font-black text-white shadow-2xl shadow-red-950/20 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {loading ? "Updating..." : "Update Password"}
            </button>

            <div className="mt-6 flex flex-col gap-3 text-center text-sm font-bold text-[#17110f]/55 sm:flex-row sm:items-center sm:justify-between sm:text-left">
              <Link href="/forgot-password" className="hover:text-[#e1062a]">
                Need a new reset link?
              </Link>
              <Link href="/login" className="hover:text-[#e1062a]">
                Back to login
              </Link>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}


export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#070303] px-5 py-10 text-white">Loading reset form...</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
