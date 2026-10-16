"use client";
import { useState } from "react";
export default function FirstLocationDryRun() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  async function run(preflight = false) {
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch(preflight ? "/api/admin/location-growth/li-v2-single-location-preflight" : "/api/admin/location-growth/li-v2-independent-dry-run", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation: "superiority-burger-119-avenue-a", dryRun: !preflight, preflight }),
      });
      const payload = await response.json();
      setResult({ httpStatus: response.status, ...payload });
    } catch { setResult({ ok: false, error: "network_request_failed" }); }
    finally { setBusy(false); }
  }
  return <div className="mt-4 space-y-3">
    <button type="button" onClick={() => run(false)} disabled={busy}
      className="rounded-xl border border-rose-300/30 px-4 py-3 text-sm font-bold text-rose-200 disabled:opacity-50">
      {busy ? "Checking evidence..." : "Dry run Superiority Burger"}
    </button>
    <button type="button" onClick={() => run(true)} disabled={busy}\n      className="ml-2 rounded-xl border border-white/20 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">\n      Preflight duplicates and staging\n    </button>\n    {result !== null && <pre aria-live="polite" className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/40 p-4 text-xs text-white/80">{JSON.stringify(result, null, 2)}</pre>}
  </div>;
}
