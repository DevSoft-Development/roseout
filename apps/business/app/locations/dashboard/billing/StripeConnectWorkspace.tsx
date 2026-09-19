"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { loadConnectAndInitialize, type StripeConnectInstance } from "@stripe/connect-js";
import {
  ConnectAccountManagement,
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
  ConnectNotificationBanner,
  ConnectPayments,
  ConnectPayouts,
} from "@stripe/react-connect-js";

type WorkspaceTab = "setup" | "account" | "payments" | "payouts";

type SessionPayload = {
  client_secret: string;
  publishable_key: string;
  mode: "live" | "test";
  account_id: string;
};

type ConnectStatusPayload = {
  connected: boolean;
  ready: boolean;
  onboardingStatus?: "complete" | "restricted" | "pending" | "not_connected";
  requiresAction?: boolean;
};

export default function StripeConnectWorkspace({ locationId, ready }: { locationId: string; ready: boolean }) {
  const [tab, setTab] = useState<WorkspaceTab>(ready ? "payments" : "setup");
  const [instance, setInstance] = useState<StripeConnectInstance | null>(null);
  const [mode, setMode] = useState<"live" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const lastReadyRef = useRef(ready);

  const fetchSession = useCallback(async () => {
    const response = await fetch("/api/business/stripe-connect/account-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ location_id: locationId }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Unable to initialize Stripe Connect.");
    return payload as SessionPayload;
  }, [locationId]);

  const refreshStatus = useCallback(async () => {
    const response = await fetch("/api/business/stripe-connect/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({ location_id: locationId }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error || "Unable to refresh Stripe status.");
    return payload as ConnectStatusPayload;
  }, [locationId]);

  const reloadWithStatus = useCallback((status: ConnectStatusPayload) => {
    const next = new URL(window.location.href);
    next.searchParams.set("locationId", locationId);
    next.searchParams.set(
      "connect",
      status.ready
        ? "ready"
        : status.requiresAction
          ? "action_required"
          : "incomplete",
    );
    window.location.replace(next.toString());
  }, [locationId]);

  const syncStatus = useCallback(async (forceReload = false) => {
    try {
      const status = await refreshStatus();
      if (!status.connected) return status;

      const changed = status.ready !== lastReadyRef.current;
      lastReadyRef.current = status.ready;
      if (status.ready) setTab("payments");

      if (forceReload || changed) {
        reloadWithStatus(status);
      }
      return status;
    } catch (cause) {
      console.warn(
        "Unable to refresh Stripe Connect status",
        cause instanceof Error ? cause.message : cause,
      );
      return null;
    }
  }, [refreshStatus, reloadWithStatus]);

  const start = useCallback(async () => {
    if (instance || loading) return;
    setLoading(true);
    setError(null);
    try {
      const first = await fetchSession();
      setMode(first.mode);
      let firstSecret: string | null = first.client_secret;
      const connectInstance = loadConnectAndInitialize({
        publishableKey: first.publishable_key,
        fetchClientSecret: async () => {
          if (firstSecret) {
            const secret = firstSecret;
            firstSecret = null;
            return secret;
          }
          return (await fetchSession()).client_secret;
        },
        appearance: {
          overlays: "dialog",
          variables: {
            colorPrimary: "#e1062a",
            colorBackground: "#ffffff",
            colorText: "#111111",
            colorDanger: "#ff2142",
            borderRadius: "14px",
          },
        },
      });
      setInstance(connectInstance);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to initialize Stripe Connect.");
    } finally {
      setLoading(false);
    }
  }, [fetchSession, instance, loading]);

  useEffect(() => {
    void start();
  }, [start]);

  useEffect(() => {
    void syncStatus();

    const interval = window.setInterval(() => {
      void syncStatus();
    }, ready ? 60000 : 10000);

    const onVisible = () => {
      if (document.visibilityState === "visible") void syncStatus();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [ready, syncStatus]);

  if (error) {
    return <div className="rounded-2xl border border-red-400/25 bg-red-500/10 p-4 text-sm font-bold text-red-100">{error}</div>;
  }

  if (!instance || loading) {
    return <div className="rounded-2xl border border-white/10 bg-black/20 p-5 text-sm font-semibold text-white/50">Loading secure Stripe setup…</div>;
  }

  const tabs: Array<{ key: WorkspaceTab; label: string }> = [
    { key: "setup", label: ready ? "Requirements" : "Setup" },
    { key: "account", label: "Business account" },
    { key: "payments", label: "Payments" },
    { key: "payouts", label: "Payouts" },
  ];

  return (
    <ConnectComponentsProvider connectInstance={instance}>
      <div className="space-y-4">
        {mode === "test" ? (
          <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-amber-100">Sandbox payment mode · no live money moves</div>
        ) : null}
        <ConnectNotificationBanner />
        <div className="flex flex-wrap gap-2 rounded-2xl border border-white/10 bg-black/20 p-2">
          {tabs.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={`rounded-xl px-4 py-2 text-xs font-black transition ${tab === item.key ? "bg-white text-black" : "text-white/55 hover:bg-white/[0.06] hover:text-white"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="min-h-[420px] overflow-hidden rounded-2xl border border-white/10 bg-white p-2 text-black sm:p-4">
          {tab === "setup" ? (
            <ConnectAccountOnboarding
              onExit={() => {
                void syncStatus(true);
              }}
            />
          ) : null}
          {tab === "account" ? <ConnectAccountManagement /> : null}
          {tab === "payments" ? <ConnectPayments /> : null}
          {tab === "payouts" ? <ConnectPayouts /> : null}
        </div>
      </div>
    </ConnectComponentsProvider>
  );
}
