"use client";

import { FormEvent, useState } from "react";
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
    const businessClaimNext = queryNext?.startsWith("/business/claim")
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
          next: businessClaimNext,
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
    <main className="min-h-screen bg-[#090706] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-6xl items-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#100b09] shadow-2xl shadow-black/50 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="relative hidden overflow-hidden border-r border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.28),transparent_34%),linear-gradient(145deg,#1a100d,#0b0807)] p-10 lg:block xl:p-14">
            <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-[#e1062a]/10 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between">
              <div>
                <p className="inline-flex rounded-full border border-[#e1062a]/40 bg-[#e1062a]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-red-100">
                  TheOutHaven Business
                </p>
                <h1 className="mt-8 max-w-xl text-5xl font-semibold leading-[1.05]">
                  Run your business from one place.
                </h1>
                <p className="mt-5 max-w-lg text-base leading-7 text-white/65">
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
                    <p className="text-sm font-bold">{title}</p>
                    <p className="mt-1 text-xs leading-5 text-white/50">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-6 sm:p-10 xl:p-14">
            <div className="mx-auto max-w-md">
              <div className="lg:hidden">
                <p className="inline-flex rounded-full border border-[#e1062a]/40 bg-[#e1062a]/10 px-4 py-2 text-xs font-bold uppercase tracking-[0.22em] text-red-100">
                  TheOutHaven Business
                </p>
              </div>

              <p className="mt-6 text-xs font-bold uppercase tracking-[0.22em] text-[#e1062a] lg:mt-0">
                Business sign in
              </p>
              <h2 className="mt-2 text-3xl font-semibold">Welcome back</h2>
              <p className="mt-3 text-sm leading-6 text-white/55">
                Sign in with the account connected to your business or location.
              </p>

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
                  className="inline-flex min-h-[54px] w-full items-center justify-center rounded-full bg-[#e1062a] px-6 text-sm font-bold text-white shadow-xl shadow-red-950/30 transition hover:-translate-y-0.5 hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                >
                  {loading ? "Signing in…" : "Sign in to Business"}
                </button>
              </form>

              <div className="mt-8 border-t border-white/10 pt-6 text-center">
                <p className="text-sm text-white/50">Not on TheOutHaven Business yet?</p>
                <a
                  href="https://theouthaven.com/business#plans"
                  className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-full border border-white/15 px-5 text-sm font-bold text-white transition hover:border-[#e1062a]/60 hover:bg-[#e1062a]/10"
                >
                  Get started with Business
                </a>
              </div>

              <p className="mt-7 text-center text-xs leading-5 text-white/35">
                Looking for outing ideas instead?{" "}
                <a href="https://theouthaven.com/login" className="font-semibold text-white/55 hover:text-white">
                  Consumer sign in
                </a>
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
