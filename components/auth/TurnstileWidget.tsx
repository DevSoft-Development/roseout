"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

type TurnstileWidgetProps = {
  onTokenChange: (token: string | null) => void;
  turnstileRef?: import("react").RefObject<TurnstileInstance | null>;
};

export function TurnstileWidget({ onTokenChange, turnstileRef }: TurnstileWidgetProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
        Turnstile site key is not configured.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <Turnstile
        ref={turnstileRef}
        siteKey={siteKey}
        options={{ theme: "dark" }}
        onSuccess={(token) => onTokenChange(token)}
        onExpire={() => onTokenChange(null)}
        onError={() => onTokenChange(null)}
      />
    </div>
  );
}
