"use client";

import { useState } from "react";

type SmokeResult = {
  success?: boolean;
  message?: string;
  results?: Record<string, { ok?: boolean; id?: string }>;
};

export default function DemoE2ESmokeButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SmokeResult | null>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const response = await fetch("/api/admin/demo/theouthaven-lounge/e2e-smoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source: "internal_lounge_launcher" }),
      });
      const payload = (await response.json().catch(() => ({}))) as SmokeResult;
      setResult({
        ...payload,
        success: response.ok && payload.success === true,
        message:
          payload.message ||
          (response.ok ? "Production-path smoke completed." : "Production-path smoke failed."),
      });
    } catch {
      setResult({ success: false, message: "Production-path smoke request failed." });
    } finally {
      setRunning(false);
    }
  }

  const passed = result?.results
    ? Object.values(result.results).filter((item) => item?.ok).length
    : 0;

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-black transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? "Running production smoke…" : "Run production E2E smoke"}
      </button>
      {result ? (
        <p
          className={`max-w-xl text-xs font-bold leading-5 ${
            result.success ? "text-emerald-200" : "text-rose-200"
          }`}
        >
          {result.success
            ? `Passed ${passed}/5 production write flows. Messaging, notifications, check-in, offer claim, and QR scan were verified.`
            : result.message}
        </p>
      ) : (
        <p className="max-w-xl text-xs font-semibold leading-5 text-white/45">
          Uses the real production routes against the hidden Lounge fixture. Messaging remains never-send; demo notification SMS stays blocked.
        </p>
      )}
    </div>
  );
}
