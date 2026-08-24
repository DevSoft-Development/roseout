"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getAnalyticsIdentity, trackClientEvent } from "@/lib/analytics/trackClientEvent";

const SESSION_START_KEY = "theouthaven_analytics_session_started_at";
const LAST_HEARTBEAT_KEY = "theouthaven_analytics_last_heartbeat";
const ERROR_DEDUPE_KEY = "theouthaven_error_dedupe";

function sessionStart() {
  try {
    const existing = Number(sessionStorage.getItem(SESSION_START_KEY));
    if (Number.isFinite(existing) && existing > 0) return existing;
    const value = Date.now();
    sessionStorage.setItem(SESSION_START_KEY, String(value));
    return value;
  } catch {
    return Date.now();
  }
}

function reportError(input: Record<string, unknown>) {
  try {
    const identity = getAnalyticsIdentity();
    const route = window.location.pathname;
    const fingerprint = `${String(input.error_type || "error")}|${String(input.message || "")}|${route}`.slice(0, 1000);
    try {
      const raw = sessionStorage.getItem(ERROR_DEDUPE_KEY);
      const current = raw ? JSON.parse(raw) as Record<string, number> : {};
      const last = Number(current[fingerprint] || 0);
      if (Date.now() - last < 60_000) return;
      current[fingerprint] = Date.now();
      sessionStorage.setItem(ERROR_DEDUPE_KEY, JSON.stringify(current));
    } catch {}

    void fetch("/api/telemetry/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        ...identity,
        route,
        url: window.location.href,
        environment: process.env.NODE_ENV,
        occurred_at: new Date().toISOString(),
        ...input,
      }),
    });
  } catch {}
}

export default function GlobalProductTelemetry() {
  const pathname = usePathname();

  useEffect(() => {
    const startedAt = sessionStart();
    trackClientEvent({
      event_name: "page_view",
      source: "global_product_telemetry",
      metadata: { session_started_at: new Date(startedAt).toISOString() },
    });
  }, [pathname]);

  useEffect(() => {
    const startedAt = sessionStart();
    const heartbeat = () => {
      if (document.visibilityState !== "visible") return;
      try {
        const last = Number(sessionStorage.getItem(LAST_HEARTBEAT_KEY) || 0);
        if (Date.now() - last < 25_000) return;
        sessionStorage.setItem(LAST_HEARTBEAT_KEY, String(Date.now()));
      } catch {}
      trackClientEvent({
        event_name: "session_heartbeat",
        source: "global_product_telemetry",
        metadata: { session_duration_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)) },
      });
    };

    const timer = window.setInterval(heartbeat, 30_000);
    heartbeat();
    const onVisibility = () => heartbeat();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", heartbeat);

    const onError = (event: ErrorEvent) => reportError({
      error_type: "client_runtime_error",
      severity: "error",
      message: event.message || "Client runtime error",
      stack: event.error?.stack || null,
      source: event.filename || "window.error",
      line: event.lineno || null,
      column: event.colno || null,
      user_visible: false,
    });
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      reportError({
        error_type: "unhandled_promise_rejection",
        severity: "error",
        message: reason instanceof Error ? reason.message : String(reason || "Unhandled promise rejection"),
        stack: reason instanceof Error ? reason.stack || null : null,
        source: "window.unhandledrejection",
        user_visible: false,
      });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", heartbeat);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
