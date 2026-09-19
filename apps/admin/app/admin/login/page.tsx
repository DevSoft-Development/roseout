"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Building2,
  Fingerprint,
  LockKeyhole,
  MonitorSmartphone,
  Network,
  ShieldCheck,
} from "lucide-react";
import { sanitizeIntendedPath } from "@theouthaven/auth/redirect";

const ERROR_MESSAGES: Record<string, string> = {
  oauth_failed: "Microsoft sign-in could not be completed. Please try again.",
  invalid_identity: "We could not verify the Microsoft identity returned for this sign-in.",
  not_authorized: "Your Microsoft account is not authorized for TheOutHaven administration.",
  provider_required: "This admin role requires Microsoft 365 sign-in.",
};

type SecurityContext = {
  ip: string;
  browser: string;
  platform: string;
};

export default function AdminLoginPage() {
  const autoStarted = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [nextPath, setNextPath] = useState("/admin/dashboard");
  const [securityContext, setSecurityContext] = useState<SecurityContext>({
    ip: "Detecting…",
    browser: "Detecting…",
    platform: "Detecting…",
  });

  const signInWithMicrosoft = useCallback(() => {
    setLoading(true);
    setError("");

    const startUrl = new URL("/auth/admin/start", window.location.origin);
    startUrl.searchParams.set("next", nextPath);
    window.location.assign(startUrl.toString());
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

  useEffect(() => {
    let active = true;

    fetch("/api/security-context", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("security_context_unavailable");
        return response.json() as Promise<SecurityContext>;
      })
      .then((context) => {
        if (active) setSecurityContext(context);
      })
      .catch(() => {
        if (!active) return;
        setSecurityContext({
          ip: "Unavailable",
          browser: navigator.userAgent || "Unavailable",
          platform: navigator.platform || "Unavailable",
        });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main
      data-surface="admin"
      className="relative min-h-screen overflow-hidden bg-[#050505] px-5 py-8 text-white sm:px-8 lg:px-12"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(225,6,42,0.18),transparent_30%),radial-gradient(circle_at_85%_80%,rgba(225,6,42,0.08),transparent_28%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:linear-gradient(rgba(255,255,255,.9)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.9)_1px,transparent_1px)] [background-size:44px_44px]" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0a]/95 shadow-[0_30px_100px_rgba(0,0,0,.65)] backdrop-blur-xl lg:grid-cols-[1.05fr_.95fr]">
          <div className="relative flex flex-col justify-between border-b border-white/10 p-7 sm:p-10 lg:min-h-[690px] lg:border-b-0 lg:border-r">
            <div>
              <div className="mb-12 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#e1062a]/30 bg-[#e1062a]/10 shadow-[0_0_45px_rgba(225,6,42,.16)]">
                  <Image
                    src="/theouthaven-icon.png"
                    alt="TheOutHaven"
                    width={36}
                    height={36}
                    priority
                    className="h-9 w-9 object-contain"
                  />
                </div>
                <div>
                  <p className="text-lg font-black tracking-tight">TheOutHaven</p>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] text-white/40">
                    Administration
                  </p>
                </div>
              </div>

              <div className="max-w-xl">
                <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e1062a]/25 bg-[#e1062a]/10 px-3 py-1.5 text-xs font-black uppercase tracking-[0.16em] text-rose-100">
                  <ShieldCheck className="h-4 w-4" />
                  Secure staff access
                </div>
                <h1 className="text-4xl font-black leading-[1.05] tracking-[-0.035em] sm:text-5xl">
                  The command center behind
                  <span className="block text-[#ff3658]">TheOutHaven.</span>
                </h1>
                <p className="mt-5 max-w-lg text-sm font-medium leading-7 text-white/55 sm:text-base">
                  Authorized team members can securely access operations, locations,
                  CRM, platform health, marketing, and internal systems from one
                  protected workspace.
                </p>
              </div>
            </div>

            <div className="mt-12 grid gap-3 sm:grid-cols-3 lg:mt-0">
              {[
                ["Microsoft 365", "Identity protected"],
                ["AWS", "Isolated Admin runtime"],
                ["Audit", "Security activity logged"],
              ].map(([title, detail]) => (
                <div key={title} className="rounded-2xl border border-white/8 bg-white/[0.035] p-4">
                  <p className="text-xs font-black text-white">{title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-white/38">{detail}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center p-7 sm:p-10 lg:p-12">
            <div className="w-full">
              <div className="mb-8">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05]">
                  <LockKeyhole className="h-5 w-5 text-[#ff526e]" />
                </div>
                <h2 className="text-2xl font-black tracking-tight">Administrator sign in</h2>
                <p className="mt-2 text-sm leading-6 text-white/50">
                  Continue with your authorized Microsoft 365 identity.
                </p>
              </div>

              {error ? (
                <p
                  role="alert"
                  className="mb-5 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-100"
                >
                  {error}
                </p>
              ) : null}

              <button
                type="button"
                onClick={signInWithMicrosoft}
                disabled={loading}
                className="group inline-flex min-h-14 w-full cursor-pointer items-center justify-between rounded-2xl bg-white px-5 text-sm font-black text-black shadow-[0_12px_35px_rgba(255,255,255,.08)] transition hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span className="flex items-center gap-3">
                  <span className="grid h-6 w-6 grid-cols-2 gap-[2px]" aria-hidden="true">
                    <span className="bg-[#f35325]" />
                    <span className="bg-[#81bc06]" />
                    <span className="bg-[#05a6f0]" />
                    <span className="bg-[#ffba08]" />
                  </span>
                  {loading ? "Redirecting to Microsoft…" : "Sign in with Microsoft"}
                </span>
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </button>

              <div className="mt-6 rounded-2xl border border-[#e1062a]/20 bg-[#e1062a]/[0.06] p-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#ff526e]" />
                  <div>
                    <p className="text-sm font-black text-white">Security notice</p>
                    <p className="mt-1 text-xs font-medium leading-5 text-white/50">
                      This administrative portal records sign-in activity, including
                      IP address, browser/device details, timestamps, and authentication
                      outcomes for security, fraud prevention, and audit purposes.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-white/55">
                    <Fingerprint className="h-4 w-4 text-[#ff526e]" />
                    Security session
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-300/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                    Logging active
                  </span>
                </div>

                <div className="divide-y divide-white/7">
                  <SecurityRow
                    icon={<Network className="h-4 w-4" />}
                    label="IP address"
                    value={securityContext.ip}
                  />
                  <SecurityRow
                    icon={<MonitorSmartphone className="h-4 w-4" />}
                    label="Browser"
                    value={securityContext.browser}
                  />
                  <SecurityRow
                    icon={<Building2 className="h-4 w-4" />}
                    label="Device"
                    value={securityContext.platform}
                  />
                </div>
              </div>

              <div className="mt-5 flex items-center justify-center gap-2 text-center text-[11px] font-semibold text-white/30">
                <LockKeyhole className="h-3.5 w-3.5" />
                Authorized administrative accounts only
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SecurityRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_minmax(0,1.6fr)] items-center gap-4 px-4 py-3.5">
      <div className="flex items-center gap-2 text-xs font-bold text-white/45">
        <span className="text-white/35">{icon}</span>
        {label}
      </div>
      <p className="truncate text-right text-xs font-black text-white/75" title={value}>
        {value}
      </p>
    </div>
  );
}
