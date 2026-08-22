"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase-browser";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Microsoft sign-in could not be completed. Please try again.",
  invalid_identity: "We could not verify the Microsoft identity returned for this sign-in.",
  not_authorized: "Your Microsoft account is not authorized for TheOutHaven administration.",
  provider_required: "Administrative access requires your Microsoft 365 account.",
};

const PRODUCTION_ADMIN_CALLBACK_ORIGIN = "https://theouthaven.com";

function MicrosoftMark() {
  return (
    <span className="grid h-5 w-5 grid-cols-2 gap-[2px]" aria-hidden="true">
      <span className="bg-[#f25022]" />
      <span className="bg-[#7fba00]" />
      <span className="bg-[#00a4ef]" />
      <span className="bg-[#ffb900]" />
    </span>
  );
}

export default function AdminLoginPage() {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextPath, setNextPath] = useState("/admin/dashboard");

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const safeNext = sanitizeIntendedPath(params.get("next"));
    if (safeNext?.startsWith("/admin")) setNextPath(safeNext);

    const errorCode = params.get("error");
    if (errorCode) setError(ERROR_MESSAGES[errorCode] || "Administrative sign-in failed. Please try again.");
  }, []);

  const signInWithMicrosoft = async () => {
    setLoading(true);
    setError("");

    const isProductionHostname =
      window.location.hostname === "theouthaven.com" ||
      window.location.hostname === "www.theouthaven.com";
    const callbackOrigin = isProductionHostname
      ? PRODUCTION_ADMIN_CALLBACK_ORIGIN
      : window.location.origin;
    const callback = new URL("/auth/admin/callback", callbackOrigin);
    callback.searchParams.set("next", nextPath);

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email",
        redirectTo: callback.toString(),
      },
    });

    if (oauthError) {
      console.error("Microsoft admin sign-in failed", oauthError);
      setLoading(false);
      setError(
        oauthError.message.toLowerCase().includes("provider")
          ? "Microsoft sign-in is not enabled yet. Finish the Entra/Supabase provider setup first."
          : "Microsoft sign-in could not be started. Please try again.",
      );
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#090706] px-4 py-16 text-white">
      <section className="w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,0.18),transparent_34%),linear-gradient(180deg,#17100d,#0f0a08)] p-7 shadow-2xl shadow-black/50 sm:p-9">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#e1062a]">TheOutHaven</p>
            <h1 className="mt-2 text-3xl font-semibold">Administration</h1>
          </div>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/65">
            Internal access
          </span>
        </div>

        <p className="mt-5 text-sm leading-6 text-white/65">
          Sign in with your authorized Microsoft 365 account. Microsoft verifies your identity and TheOutHaven applies your existing admin role and permissions.
        </p>

        {error ? (
          <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm leading-6 text-red-100">
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={signInWithMicrosoft}
          disabled={loading}
          className="mt-7 flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 text-sm font-bold text-[#17100d] transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-65"
        >
          <MicrosoftMark />
          {loading ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
        </button>

        <div className="mt-6 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/50">Access policy</p>
          <p className="mt-2 text-sm leading-6 text-white/65">
            A valid Microsoft sign-in alone does not grant access. Your identity must also have an active role in TheOutHaven&apos;s admin authorization system.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-white/45">
          <span>Protected by Microsoft Entra ID</span>
          <Link
            href={`/login?next=${encodeURIComponent(nextPath)}`}
            className="underline decoration-white/20 underline-offset-4 transition hover:text-white/75"
          >
            Emergency administrator sign-in
          </Link>
        </div>
      </section>
    </main>
  );
}
