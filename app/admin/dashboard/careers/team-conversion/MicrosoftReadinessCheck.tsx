"use client";

import { useState } from "react";

type ReadinessCheck = {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
};

type ReadinessResult = {
  success?: boolean;
  ready?: boolean;
  checkedAt?: string;
  checks?: ReadinessCheck[];
  note?: string;
  error?: string;
};

export default function MicrosoftReadinessCheck() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReadinessResult | null>(null);

  async function runCheck() {
    setBusy(true);
    setResult(null);

    try {
      const response = await fetch(
        "/api/admin/careers/team-conversion/microsoft-readiness",
        { method: "POST" },
      );
      const data = (await response.json().catch(() => ({}))) as ReadinessResult;
      if (!response.ok || data.success === false) {
        throw new Error(data.error || "Microsoft readiness check failed.");
      }
      setResult(data);
    } catch (error) {
      setResult({
        success: false,
        ready: false,
        error: error instanceof Error ? error.message : "Microsoft readiness check failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-black text-white">Microsoft 365 provisioning readiness</h3>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-white/60">
            Runs from the production Supabase Edge runtime and verifies the configured Microsoft secrets,
            app-only token, required Graph permissions, Business Premium SKU, and non-destructive Graph user access.
            It does not create or modify a Microsoft account.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={runCheck}
          className="rounded-xl bg-rose-500 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
        >
          {busy ? "Testing..." : "Test Microsoft readiness"}
        </button>
      </div>

      {result ? (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-black ${
                result.ready
                  ? "bg-emerald-500/15 text-emerald-200"
                  : "bg-amber-500/15 text-amber-100"
              }`}
            >
              {result.ready ? "READY" : "NEEDS ATTENTION"}
            </span>
            {result.checkedAt ? (
              <span className="text-xs text-white/45">
                Checked {new Date(result.checkedAt).toLocaleString()}
              </span>
            ) : null}
          </div>

          {result.error ? (
            <p className="mt-3 text-sm font-bold text-red-200">{result.error}</p>
          ) : null}

          {Array.isArray(result.checks) && result.checks.length ? (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {result.checks.map((check) => (
                <div
                  key={check.key}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
                >
                  <div className="flex items-center gap-2">
                    <span className={check.ok ? "text-emerald-300" : "text-amber-200"}>
                      {check.ok ? "PASS" : "CHECK"}
                    </span>
                    <span className="text-sm font-black text-white">{check.label}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-white/55">{check.detail}</p>
                </div>
              ))}
            </div>
          ) : null}

          {result.note ? (
            <p className="mt-3 text-xs leading-5 text-white/45">{result.note}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
