"use client";

import { FormEvent, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";

const inputClass =
  "min-h-[56px] w-full rounded-2xl border border-white/10 bg-white/[0.05] px-4 text-white outline-none transition placeholder:text-white/35 focus:border-[#e1062a]/70 focus:ring-2 focus:ring-[#e1062a]/20";

export default function BusinessLoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setError("");

    const queryNext = sanitizeIntendedPath(
      new URL(window.location.href).searchParams.get("next"),
    );
    const businessNext =
      queryNext &&
      (queryNext.startsWith("/locations/dashboard") ||
        queryNext.startsWith("/business/dashboard") ||
        queryNext.startsWith("/business/claim"))
        ? queryNext
        : null;
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          next: businessNext,
        }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        setLoading(false);
        setError(data?.message || "We could not sign you in. Please try again.");
        return;
      }

      window.location.replace(data.redirectTo || "/business/dashboard");
    } catch {
      setLoading(false);
      setError("We could not sign you in. Please check your connection and try again.");
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050505] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(225,6,42,0.18),transparent_30%),radial-gradient(circle_at_85%_80%,rgba(225,6,42,0.08),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.9)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0a]/95 shadow-[0_30px_100px_rgba(0,0,0,.65)] backdrop-blur-xl lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative hidden min-h-[690px] overflow-hidden border-r border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.22),transparent_34%),linear-gradient(145deg,#120b0d,#080708)] p-10 lg:block xl:p-14">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#e1062a]/10 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <div className="mb-8 flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-[#e1062a]/30 bg-[#e1062a]/10 shadow-[0_0_45px_rgba(225,6,42,.16)]">
                    {/* The isolated Business app does not ship the consumer public asset bundle. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/api/brand/theouthaven-logo"
                      alt="TheOutHaven"
                      width={36}
                      height={36}
                      className="h-9 w-9 object-contain"
                    />
                  </div>
                  <div>
                    <p className="text-lg font-black tracking-tight">TheOutHaven</p>
                    <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">Business</p>
                  </div>
                </div>
                <p className="inline-flex items-center gap-2 rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-rose-100">
                  <ShieldCheck className="h-4 w-4" />
                  Secure business access
                </p>
                <h1 className="mt-5 max-w-xl text-5xl font-black leading-[1.05] tracking-[-0.035em]">
                  Run your business from one place.
                </h1>
                <p className="mt-5 max-w-lg text-base font-medium leading-7 text-white/55">
                  Manage your location, reservations, events, experiences, customer activity, and business tools from your TheOutHaven dashboard.
                </p>
              </div>

              <div className="mt-12 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
                {[
                  ["Manage", "Your location and presence"],
                  ["Grow", "Reach more outing customers"],
                  ["Operate", "Reservations and experiences"],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.035] p-4">
                    <p className="text-sm font-black">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/50">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center p-6 sm:p-10 xl:p-14">
            <div className="mx-auto w-full max-w-md">
              <div className="lg:hidden">
                <div className="mb-5 flex items-center justify-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl border border-[#e1062a]/30 bg-[#e1062a]/10">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/api/brand/theouthaven-logo"
                      alt="TheOutHaven"
                      width={32}
                      height={32}
                      className="h-8 w-8 object-contain"
                    />
                  </div>
                  <div className="text-left">
                    <p className="text-base font-black tracking-tight">TheOutHaven</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-white/40">Business</p>
                  </div>
                </div>
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-2 rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-4 py-2 text-xs font-black uppercase tracking-[0.16em] text-rose-100">
                    <ShieldCheck className="h-4 w-4" />
                    Secure business access
                  </span>
                </div>
              </div>

              <div className="mb-8">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                  <LockKeyhole className="h-5 w-5 text-[#ff526e]" />
                </div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#ff3658]">
                  Business sign in
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-tight">Welcome back</h2>
                <p className="mt-2 text-sm leading-6 text-white/50">
                  Sign in with the account connected to your business or location.
                </p>
              </div>

              {error && (
                <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-semibold text-white/80">Email address</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                    placeholder="you@business.com"
                    className={inputClass}
                  />
                </label>

                <label className="block">
                  <div className="mb-2 flex items-center justify-between gap-4">
                    <span className="text-sm font-semibold text-white/80">Password</span>
                    <a
                      href="https://theouthaven.com/forgot-password"
                      className="text-xs font-semibold text-white/55 transition hover:text-white"
                    >
                      Forgot password?
                    </a>
                  </div>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                      placeholder="Enter your password"
                      className={`${inputClass} pr-20`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute inset-y-0 right-3 my-auto h-9 rounded-full px-3 text-xs font-semibold text-white/55 transition hover:bg-white/5 hover:text-white"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={loading}
                  className="group inline-flex min-h-14 w-full items-center justify-between rounded-2xl bg-[#e1062a] px-5 text-sm font-black text-white shadow-[0_12px_35px_rgba(225,6,42,.18)] transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  <span>{loading ? "Signing in…" : "Sign in to Business"}</span>
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </button>
              </form>

              <div className="mt-8 border-t border-white/10 pt-6 text-center">
                <p className="text-sm text-white/50">Not on TheOutHaven Business yet?</p>
                <a
                  href="https://theouthaven.com/business#plans"
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-white/15 px-5 text-sm font-black text-white transition hover:border-[#e1062a]/60 hover:bg-[#e1062a]/10"
                >
                  Get started with Business
                </a>
              </div>

              <div className="mt-7 space-y-2 text-center text-xs leading-5 text-white/35">
                <p>
                  Looking for outing ideas instead?{" "}
                  <a href="https://theouthaven.com/login" className="font-semibold text-white/55 hover:text-white">
                    Consumer sign in
                  </a>
                </p>
                <p>
                  TheOutHaven staff?{" "}
                  <a href="https://admin.theouthaven.com/admin/login" className="font-semibold text-white/55 hover:text-white">
                    Admin login
                  </a>
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
