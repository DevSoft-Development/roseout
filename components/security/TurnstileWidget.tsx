"use client";

import { useEffect, useRef, useState } from "react";

declare global { interface Window { turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; remove?: (id: string) => void } } }

type Props = { action: string; onToken: (token: string) => void; onExpire?: () => void; onError?: () => void; className?: string; theme?: "auto" | "light" | "dark" };

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export default function TurnstileWidget({ action, onToken, onExpire, onError, className, theme = "auto" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey) return;
    if (window.turnstile) { setReady(true); return; }
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    const script = existing ?? document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => setReady(true);
    script.onerror = () => onError?.();
    if (!existing) document.head.appendChild(script);
  }, [onError, siteKey]);

  useEffect(() => {
    if (!ready || !siteKey || !ref.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(ref.current, {
      sitekey: siteKey,
      action,
      theme,
      callback: (token: string) => onToken(token),
      "expired-callback": () => { onExpire?.(); onToken(""); },
      "error-callback": () => { onError?.(); onToken(""); },
    });
    return () => { if (widgetId.current && window.turnstile?.remove) window.turnstile.remove(widgetId.current); widgetId.current = null; };
  }, [action, onError, onExpire, onToken, ready, siteKey, theme]);

  if (!siteKey) {
    return <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/65 ${className ?? ""}`}>Verification helps protect TheOutHaven from spam. Turnstile is not configured in this environment.</div>;
  }
  return <div className={className}><div ref={ref} /></div>;
}
