"use client";

import { useEffect, useState } from "react";
import MenuEditorClient from "@/app/business/dashboard/menu/MenuEditorClient";
import { toSelectedLocationRequestContext, type LocationEditorContext } from "./location-editor-context";

export default function LocationEditorMenuPanel({ context, returnHref }: { context: LocationEditorContext; returnHref: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams();
    Object.entries(toSelectedLocationRequestContext(context)).forEach(([key, value]) => { if (value !== undefined && value !== null && value !== "") qs.set(key, String(value)); });
    fetch(`/api/business/menu?${qs.toString()}`, { cache: "no-store" })
      .then(async (res) => ({ res, json: await res.json().catch(() => ({})) }))
      .then(({ res, json }) => { if (cancelled) return; if (!res.ok) setError(json.message || "Menu could not be loaded."); else setData(json); })
      .catch(() => !cancelled && setError("Menu could not be loaded."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [context]);
  if (loading) return <div className="rounded-3xl border border-white/10 bg-black/25 p-6 text-sm font-bold text-white/60">Loading menu editor…</div>;
  if (error) return <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6 font-bold text-red-100">{error}</div>;
  return <MenuEditorClient initialData={data} locationId={context.effectiveLocationId} selectedContext={toSelectedLocationRequestContext(context)} contextKey={context.isAdminContext || context.isDemoMode ? "adminLocationId" : "locationId"} mode={context.isAdminContext ? "admin" : "business"} returnHref={returnHref} embedded />;
}
