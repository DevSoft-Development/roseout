"use client";

import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { useRef } from "react";

type TurnstileWidgetProps = {
  onTokenChange: (token: string | null) => void;
};

export function TurnstileWidget({ onTokenChange }: TurnstileWidgetProps) {
  const ref = useRef<TurnstileInstance>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  if (!siteKey) {
    return (
      <div className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-200">
        Turnstile site key is not configured.
      </div>
    );
  }

  return (
    <div className="mt-3">
      <Turnstile
        ref={ref}
        siteKey={siteKey}
        options={{ theme: "dark" }}
        onSuccess={(token) => onTokenChange(token)}
        onExpire={() => onTokenChange(null)}
        onError={() => onTokenChange(null)}
      />
    </div>
  );
}
