"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { getAnalyticsIdentity } from "@/lib/analytics/trackClientEvent";

const SESSION_STARTED_KEY = "theouthaven_session_started_at";
const seenErrors = new Map<string, number>();

function send(event: Record<string, unknown>) {
  try {
    const identity = getAnalyticsIdentity();
    void fetch("/api/telemetry/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({ ...identity, source: "global_telemetry", ...event }),
    });
  } catch {
    // Telemetry can never break the user experience.
  }
}

function sessionStartedAt() {
  if (typeof window === "undefined") return Date.now();
  try {
    const existing = Number(window.sessionStorage.getItem(SESSION_STARTED_KEY));
    if (Number.isFinite(existing) && existing > 0) return existing;
    const now = Date.now();
    window.sessionStorage.setItem(SESSION_STARTED_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

function errorMessage(value: unknown) {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

function reportVisibleError(message: string, component = "dom_alert") {
  const clean = message.replace(/\s+/g, " ").trim().slice(0, 1000);
  if (!clean || clean.length < 3) return;
  const key = `${window.location.pathname}|${clean}`;
  const now = Date.now();
  if ((seenErrors.get(key) ?? 0) > now - 60_000) return;
  seenErrors.set(key, now);
  send({ event_type: "user_visible_error", event_name: "user_visible_error", severity: "error", page_path: window.location.pathname, message: clean, component });
}

export default function GlobalTelemetry() {
  const pathname = usePathname();
  const startedAt = useRef<number>(0);

  useEffect(() => {
    startedAt.current = sessionStartedAt();
    send({ event_type: "session_start", event_name: "session_start", page_path: window.location.pathname, metadata: { started_at_ms: startedAt.current } });

    const heartbeat = () => {
      const durationMs = Math.max(0, Date.now() - startedAt.current);
      send({ event_type: document.visibilityState === "hidden" ? "session_end" : "session_heartbeat", event_name: "session_heartbeat", page_path: window.location.pathname, metadata: { duration_ms: durationMs, visibility: document.visibilityState } });
    };
    const interval = window.setInterval(heartbeat, 30_000);
    const onPageHide = () => heartbeat();
    window.addEventListener("pagehide", onPageHide);

    const onError = (event: ErrorEvent) => send({
      event_type: "runtime_error", event_name: "window_error", severity: "error",
      page_path: window.location.pathname, message: event.message,
      component: event.filename || null,
      metadata: { line: event.lineno, column: event.colno },
    });
    const onRejection = (event: PromiseRejectionEvent) => send({
      event_type: "unhandled_rejection", event_name: "unhandled_rejection", severity: "error",
      page_path: window.location.pathname, message: errorMessage(event.reason),
    });
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      try {
        send({ event_type: "console_error", event_name: "console_error", severity: "warning", page_path: window.location.pathname, message: args.map(errorMessage).join(" ").slice(0, 1000) });
      } catch {}
      originalConsoleError(...args);
    };

    const scan = (root: ParentNode) => {
      const nodes = root instanceof Element && root.matches?.('[role="alert"],[data-error],[data-error-message]')
        ? [root]
        : Array.from(root.querySelectorAll?.('[role="alert"],[data-error],[data-error-message]') ?? []);
      for (const node of nodes) reportVisibleError(node.textContent || "", node.getAttribute("data-error-message") || node.getAttribute("data-error") || "dom_alert");
    };
    scan(document);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of Array.from(mutation.addedNodes)) if (node instanceof Element) scan(node);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = originalConsoleError;
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!pathname) return;
    send({ event_type: "page_view", event_name: "page_view", page_path: pathname, metadata: { title: typeof document !== "undefined" ? document.title : null } });
  }, [pathname]);

  return null;
}
