"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@theouthaven/auth/browser-client";
import { sanitizeIntendedPath } from "@theouthaven/auth/redirect";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Microsoft sign-in could not be completed. Please try again.",
  invalid_identity: "We could not verify the Microsoft identity returned for this sign-in.",
  not_authorized: "Your Microsoft account is not authorized for TheOutHaven administration.",
  provider_required: "This admin role requires Microsoft 365 sign-in.",
};

export default function AdminLoginPage() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const autoStarted = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextPath, setNextPath] = useState("/admin/dashboard");

  const signInWithMicrosoft = useCallback(async () => {
    setLoading(true);
    setError("");

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
  }, [nextPath, supabase]);

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
    <main data-surface="admin">
      <h1>TheOutHaven Administration</h1>
      <p>Sign in with your authorized Microsoft 365 account.</p>
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" onClick={signInWithMicrosoft} disabled={loading}>
        {loading ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
      </button>
    </main>
  );
}
