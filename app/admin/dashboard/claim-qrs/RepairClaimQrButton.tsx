"use client";
import { useState } from "react";

export default function RepairClaimQrButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  async function runRepair() {
    setLoading(true);
    const res = await fetch("/api/admin/locations/backfill-qr", { method: "POST" });
    const json = await res.json();
    setResult(json?.result || json);
    setLoading(false);
  }
  return <div className="space-y-2"><button onClick={runRepair} disabled={loading} className="rounded-full border border-white/10 bg-white/[0.07] px-5 py-3 text-sm font-black text-white/80">{loading ? "Repairing..." : "Repair Missing QR Codes"}</button>{result && <p className="text-xs text-white/70">Restaurants updated: {result.restaurants?.updated ?? 0} • Activities updated: {result.activities?.updated ?? 0} • Locations synced: {result.locationsSynced ?? 0} • Locations repaired: {result.locationsEnsured ?? 0} • Errors: {result.errors?.length ?? 0}</p>}</div>;
}
