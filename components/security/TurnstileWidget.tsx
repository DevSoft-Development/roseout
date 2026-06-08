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

function loadTurnstileScript(onError?: () => void) {
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
  if (existing) return existing;

  const script = document.createElement("script");
  script.src = SCRIPT_SRC;
  script.async = true;
  script.defer = true;
  script.onerror = () => onError?.();
  document.head.appendChild(script);
  return script;
}

export default function TurnstileWidget({ action, onToken, onExpire, onError, onReady, resetKey, className, theme = "auto" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    if (window.turnstile) {
      setReady(true);
      onReady?.();
      return;
    }

    const script = loadTurnstileScript(onError);
    const markReady = () => {
      setReady(true);
      onReady?.();
    };

    const markError = () => onError?.();

    script.addEventListener("load", markReady);
    script.addEventListener("error", markError);

    return () => {
      script.removeEventListener("load", markReady);
      script.removeEventListener("error", markError);
    };
  }, [onError, onReady, siteKey]);

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
      callback: (token: string) => onToken(token),
      "expired-callback": () => {
        onToken("");
        onExpire?.();
      },
      "error-callback": () => {
        onToken("");
        onError?.();
      },
    });

    return () => {
      if (widgetId.current && window.turnstile?.remove) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [action, onError, onExpire, onToken, ready, resetKey, siteKey, theme]);

  if (!siteKey) {
    const message =
      process.env.NODE_ENV === "production"
        ? "Verification is temporarily unavailable. Please try again later."
        : "Verification is not configured in this environment. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY or disable Turnstile for local testing.";

    return <div className={`rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm font-bold text-amber-100 ${className ?? ""}`}>{message}</div>;
  }

  return <div className={className}><div ref={ref} /></div>;
}
