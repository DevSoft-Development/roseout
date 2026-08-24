"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getAnalyticsIdentity, trackClientEvent } from "@/lib/analytics/trackClientEvent";

const SESSION_START_KEY = "theouthaven_analytics_session_started_at";
const LAST_HEARTBEAT_KEY = "theouthaven_analytics_last_heartbeat";
const ERROR_DEDUPE_KEY = "theouthaven_error_dedupe";
const ERROR_TEXT = /\b(error|failed|failure|unable|couldn['’]?t|could not|something went wrong|page couldn['’]?t load|server error|try again)\b/i;
const ERROR_SELECTOR = '[role="alert"],[data-error-message],[data-error-state],.error-message,.error,.form-error';

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
        fingerprint,
        ...input,
      }),
    });
  } catch {}
}

function inspectVisibleError(element: Element) {
  try {
    if (!(element instanceof HTMLElement)) return;
    if (element.hidden || element.getAttribute("aria-hidden") === "true") return;
    const message = (element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 1000);
    if (!message || message.length < 4) return;
    const semanticError = element.matches(ERROR_SELECTOR);
    if (!semanticError && !ERROR_TEXT.test(message)) return;
    if (!ERROR_TEXT.test(message) && element.getAttribute("role") !== "alert" && !element.hasAttribute("data-error-message") && !element.hasAttribute("data-error-state")) return;
    reportError({
      error_type: "user_visible_error_message",
      severity: "error",
      message,
      source: "dom_error_observer",
      user_visible: true,
      metadata: {
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute("role"),
        class_name: String(element.className || "").slice(0, 250),
      },
    });
  } catch {}
}

function scanForVisibleErrors(root: ParentNode) {
  try {
    if (root instanceof Element) inspectVisibleError(root);
    root.querySelectorAll?.(ERROR_SELECTOR).forEach(inspectVisibleError);
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
    const heartbeat = (force = false) => {
      if (!force && document.visibilityState !== "visible") return;
      try {
        const last = Number(sessionStorage.getItem(LAST_HEARTBEAT_KEY) || 0);
        if (!force && Date.now() - last < 25_000) return;
        sessionStorage.setItem(LAST_HEARTBEAT_KEY, String(Date.now()));
      } catch {}
      trackClientEvent({
        event_name: "session_heartbeat",
        source: "global_product_telemetry",
        metadata: {
          session_duration_seconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
          final_heartbeat: force,
        },
      });
    };

    const timer = window.setInterval(() => heartbeat(false), 30_000);
    heartbeat(false);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") heartbeat(true);
      else heartbeat(false);
    };
    const onPageHide = () => heartbeat(true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);

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
    const onExplicitVisibleError = (event: Event) => {
      const detail = (event as CustomEvent<Record<string, unknown>>).detail || {};
      reportError({ error_type: "user_visible_error_message", severity: "error", user_visible: true, source: "explicit_ui_error", ...detail });
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("theouthaven:user-visible-error", onExplicitVisibleError as EventListener);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData" && mutation.target.parentElement) inspectVisibleError(mutation.target.parentElement);
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) scanForVisibleErrors(node);
        }
      }
    });
    if (document.body) {
      scanForVisibleErrors(document.body);
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    }

    return () => {
      heartbeat(true);
      observer.disconnect();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("theouthaven:user-visible-error", onExplicitVisibleError as EventListener);
    };
  }, []);

  return null;
}
