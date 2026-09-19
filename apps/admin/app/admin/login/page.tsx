"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@theouthaven/auth/browser-client";
import { sanitizeIntendedPath } from "@theouthaven/auth/redirect";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Microsoft sign-in could not be completed. Please try again.",
  invalid_identity: "We could not verify the Microsoft identity returned for this sign-in.",
  not_authorized: "Your Microsoft account is not authorized for TheOutHaven administration.",
  provider_required: "This admin role requires Microsoft 365 sign-in.",
};

export default function AdminLoginPage() {
  const autoStarted = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextPath, setNextPath] = useState("/admin/dashboard");

  const signInWithMicrosoft = useCallback(async () => {
    setLoading(true);
    setError("");

    const supabase = createBrowserSupabaseClient();
    const callback = new URL("/auth/admin/callback", window.location.origin);
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
      setError("Microsoft sign-in could not be started. Please try again.");
    }
  }, [nextPath]);

  useEffect(() => {
    const params = new URL(window.location.href).searchParams;
    const safeNext = sanitizeIntendedPath(params.get("next"));
    if (safeNext?.startsWith("/admin")) setNextPath(safeNext);

    const errorCode = params.get("error");
    if (errorCode) {
      setError(ERROR_MESSAGES[errorCode] || "Administrative sign-in failed. Please try again.");
      return;
    }

    if (params.get("autostart") === "1" && !autoStarted.current) {
      autoStarted.current = true;
      void signInWithMicrosoft();
    }
  }, [signInWithMicrosoft]);

  return (
    <main
      data-surface="admin"
      className="flex min-h-screen items-center justify-center bg-black px-6 py-12 text-white"
    >
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl">
        <div className="mb-6">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.18em] text-white/55">
            TheOutHaven
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Administration</h1>
          <p className="mt-3 text-sm leading-6 text-white/70">
            Sign in with your authorized Microsoft 365 account.
          </p>
        </div>

        {error ? (
          <p
            role="alert"
            className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100"
          >
            {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={signInWithMicrosoft}
          disabled={loading}
          className="inline-flex min-h-14 w-full cursor-pointer items-center justify-center rounded-2xl bg-white px-5 text-sm font-bold text-black shadow-lg transition hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
        </button>

        <p className="mt-4 text-center text-xs text-white/45">
          Authorized administrative accounts only.
        </p>
      </section>
    </main>
  );
}
