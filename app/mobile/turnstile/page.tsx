"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import TurnstileField from "@/components/security/TurnstileField";

const ALLOWED_ACTIONS = new Set(["mobile_signin", "mobile_signup"]);

type NativeBridgeWindow = Window & {
  ReactNativeWebView?: {
    postMessage: (message: string) => void;
  };
};

function TurnstileShell({ children, embedded }: { children: ReactNode; embedded: boolean }) {
  return (
    <main className={embedded ? "fixed inset-0 z-[9999] bg-[#090909] px-5 py-5 text-white" : "min-h-screen bg-[#090909] px-6 py-12 text-white"}>
      <div className={embedded ? "mx-auto flex min-h-full max-w-md items-center" : "mx-auto flex min-h-[70vh] max-w-md items-center"}>
        <section className={embedded ? "w-full rounded-[24px] border border-white/10 bg-white/[0.035] p-5" : "w-full rounded-[28px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl"}>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff8a9b]">TheOutHaven Security</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Quick verification</h1>
          {children}
        </section>
      </div>
    </main>
  );
}

function MobileTurnstileContent() {
  const params = useSearchParams();
  const requestedAction = params.get("action") || "mobile_signin";
  const action = ALLOWED_ACTIONS.has(requestedAction) ? requestedAction : "mobile_signin";
  const embedded = params.get("embedded") === "1";
  const [status, setStatus] = useState(embedded ? "Finishing your security check…" : "Complete the quick verification to return to TheOutHaven.");
  const callback = useMemo(() => `theouthaven://auth/turnstile?action=${encodeURIComponent(action)}`, [action]);

  const finish = (token: string) => {
    if (!token) {
      setStatus("Verification expired. Please try again.");
      if (embedded) {
        (window as NativeBridgeWindow).ReactNativeWebView?.postMessage(JSON.stringify({
          type: "turnstile-error",
          action,
          message: "Verification expired. Please try again.",
        }));
      }
      return;
    }

    if (embedded) {
      setStatus("Verified. Signing you in…");
      (window as NativeBridgeWindow).ReactNativeWebView?.postMessage(JSON.stringify({
        type: "turnstile-success",
        action,
        token,
      }));
      return;
    }

    setStatus("Verified. Returning to TheOutHaven…");
    window.location.href = `${callback}&token=${encodeURIComponent(token)}`;
  };

  return (
    <TurnstileShell embedded={embedded}>
      <p className="mt-3 text-sm leading-6 text-white/65">{status}</p>
      <div className="mt-6">
        <TurnstileField action={action} onToken={finish} />
      </div>
      <p className="mt-5 text-xs leading-5 text-white/45">This helps protect TheOutHaven accounts from automated sign-in and signup abuse.</p>
    </TurnstileShell>
  );
}

export default function MobileTurnstilePage() {
  return (
    <Suspense fallback={<TurnstileShell embedded={false}><p className="mt-3 text-sm leading-6 text-white/65">Preparing verification…</p></TurnstileShell>}>
      <MobileTurnstileContent />
    </Suspense>
  );
}
