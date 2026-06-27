"use client";
import { Turnstile } from "@marsidev/react-turnstile";

export default function TurnstileField({ action, onToken }: { action?: string; onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  if (!siteKey && process.env.NODE_ENV !== "production" && process.env.NEXT_PUBLIC_TURNSTILE_BYPASS_IN_DEV !== "false") {
    return <p className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-3 text-xs text-amber-50">Verification is bypassed in local development.</p>;
  }
  if (!siteKey) return <p className="rounded-2xl border border-red-300/20 bg-red-500/10 p-3 text-xs text-red-50">Verification is temporarily unavailable.</p>;
  return <Turnstile siteKey={siteKey} onSuccess={onToken} onError={() => onToken("")} onExpire={() => onToken("")} options={{ theme: "dark", size: "flexible", action: action || "growth_pro" }} />;
}
