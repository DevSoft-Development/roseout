"use client";

import { useEffect } from "react";
import { getAnalyticsIdentity } from "@/lib/analytics/trackClientEvent";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      const identity = getAnalyticsIdentity();
      void fetch("/api/telemetry/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify({
          ...identity,
          event_type: "runtime_error",
          event_name: "next_global_error",
          severity: "critical",
          page_path: typeof window !== "undefined" ? window.location.pathname : null,
          message: error.message,
          error_code: error.digest || null,
          component: "app/global-error",
          source: "next_global_error_boundary",
        }),
      });
    } catch {}
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: "#090706", color: "#fff7f2", fontFamily: "Arial, Helvetica, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <section style={{ width: "100%", maxWidth: 560, background: "#141010", border: "1px solid rgba(255,255,255,.12)", borderRadius: 24, padding: 32, textAlign: "center" }}>
            <div style={{ fontWeight: 900, fontSize: 22 }}>TheOutHaven</div>
            <h1 style={{ margin: "20px 0 8px", fontSize: 28 }}>This page couldn’t load</h1>
            <p style={{ color: "#b8aaa3", lineHeight: 1.6 }}>A system error occurred. The issue has been recorded for the team.</p>
            <button onClick={reset} style={{ marginTop: 18, border: 0, borderRadius: 999, background: "#e1062a", color: "#fff", fontWeight: 800, padding: "13px 22px", cursor: "pointer" }}>Try again</button>
          </section>
        </main>
      </body>
    </html>
  );
}
