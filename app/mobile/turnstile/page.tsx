"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import TurnstileField from "@/components/security/TurnstileField";

const ALLOWED_ACTIONS = new Set(["mobile_signin", "mobile_signup"]);

function MobileTurnstileContent() {
  const params = useSearchParams();
  const requestedAction = params.get("action") || "mobile_signin";
  const action = ALLOWED_ACTIONS.has(requestedAction) ? requestedAction : "mobile_signin";
  const [status, setStatus] = useState("Complete the quick verification to return to TheOutHaven.");
  const callback = useMemo(() => `theouthaven://auth/turnstile?action=${encodeURIComponent(action)}`, [action]);

  const finish = (token: string) => {
    if (!token) {
      setStatus("Verification expired. Please try again.");
      return;
    }
    setStatus("Verified. Returning to TheOutHaven…");
    window.location.href = `${callback}&token=${encodeURIComponent(token)}`;
  };

  return (
    <main className="min-h-screen bg-[#090909] px-6 py-12 text-white">
      <div className="mx-auto flex min-h-[70vh] max-w-md items-center">
        <section className="w-full rounded-[28px] border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ff8a9b]">TheOutHaven Security</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight">Quick verification</h1>
          <p className="mt-3 text-sm leading-6 text-white/65">{status}</p>
          <div className="mt-6">
            <TurnstileField action={action} onToken={finish} />
          </div>
          <p className="mt-5 text-xs leading-5 text-white/45">This helps protect TheOutHaven accounts from automated sign-in and signup abuse.</p>
        </section>
      </div>
    </main>
  );
}

export default function MobileTurnstilePage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-[#090909]" />}>
      <MobileTurnstileContent />
    </Suspense>
  );
}
