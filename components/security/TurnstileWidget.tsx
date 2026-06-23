"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove?: (id: string) => void;
    };
  }
}

type Props = {
  action: string;
  onToken: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
  onReady?: () => void;
  resetKey?: number | string;
  className?: string;
  theme?: "auto" | "light" | "dark";
};

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const SCRIPT_LOAD_TIMEOUT_MS = 10000;

function loadTurnstileScript() {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) return existing;

  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  document.head.appendChild(script);
  return script;
}

export default function TurnstileWidget({ action, onToken, onExpire, onError, onReady, resetKey, className, theme = "auto" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const scriptErrorReportedRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    onTokenRef.current = onToken;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
  }, [onError, onExpire, onReady, onToken]);

  useEffect(() => {
    if (!siteKey) return;

    function reportLoadError() {
      if (scriptErrorReportedRef.current) return;
      scriptErrorReportedRef.current = true;
      setLoadTimedOut(true);
      onErrorRef.current?.();
    }

    function markReady() {
      if (!window.turnstile) return;
      setReady(true);
      setLoadTimedOut(false);
      onReadyRef.current?.();
    }

    if (window.turnstile) {
      markReady();
      return;
    }

    const script = loadTurnstileScript();
    const timeout = window.setTimeout(() => {
      if (!window.turnstile) reportLoadError();
    }, SCRIPT_LOAD_TIMEOUT_MS);

    const handleLoad = () => {
      window.clearTimeout(timeout);
      if (window.turnstile) markReady();
      else reportLoadError();
    };
    const handleError = () => {
      window.clearTimeout(timeout);
      reportLoadError();
    };

    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    return () => {
      window.clearTimeout(timeout);
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
  }, [siteKey]);

  useEffect(() => {
    if (!ready || !siteKey || !ref.current || !window.turnstile) return;

    if (widgetId.current && window.turnstile.remove) {
      window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    }

    widgetId.current = window.turnstile.render(ref.current, {
      sitekey: siteKey,
      action,
      theme,
      callback: (token: string) => onTokenRef.current(token),
      "expired-callback": () => {
        onTokenRef.current("");
        onExpireRef.current?.();
      },
      "error-callback": () => {
        onTokenRef.current("");
        onErrorRef.current?.();
      },
    });

    return () => {
      if (widgetId.current && window.turnstile?.remove) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action, ready, resetKey, siteKey, theme]);

  if (!siteKey) {
    const message =
      process.env.NODE_ENV === "production"
        ? "Verification is temporarily unavailable. Please try again later."
        : "Verification is not configured in this environment. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY or disable Turnstile for local testing.";

    return <div className={`rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100 ${className ?? ""}`}>{message}</div>;
  }

  if (loadTimedOut) {
    return <div className={`rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100 ${className ?? ""}`}>Verification is taking too long. Refresh the page and try again.</div>;
  }

  return <div className={className}><div ref={ref} /></div>;
}
