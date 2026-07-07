"use client";

import { useEffect, useState } from "react";
import MenuEditorClient from "@/app/business/dashboard/menu/MenuEditorClient";
import type { LocationEditorContext } from "./location-editor-context";

export default function LocationEditorMenuPanel({ context, returnHref }: { context: LocationEditorContext; returnHref: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ locationId: context.effectiveLocationId, type: context.type });
    if (context.canonicalId) qs.set("canonicalId", context.canonicalId);
    if (context.adminLocationId || context.isAdminContext) qs.set("adminLocationId", context.adminLocationId || context.effectiveLocationId);
    if (context.sourceId) qs.set("sourceId", context.sourceId);
    if (context.isDemoMode) qs.set("demo", "1");
    if (context.fromDemoCenter) qs.set("fromDemoCenter", "1");
    fetch(`/api/business/menu?${qs.toString()}`, { cache: "no-store" })
      .then(async (res) => ({ res, json: await res.json().catch(() => ({})) }))
      .then(({ res, json }) => { if (cancelled) return; if (!res.ok) setError(json.message || "Menu could not be loaded."); else setData(json); })
      .catch(() => !cancelled && setError("Menu could not be loaded."))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [context]);
  if (loading) return <div className="rounded-3xl border border-white/10 bg-black/25 p-6 text-sm font-bold text-white/60">Loading menu editor…</div>;
  if (error) return <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-6 font-bold text-red-100">{error}</div>;
  const contextPayload = {
    locationId: context.effectiveLocationId,
    adminLocationId: context.adminLocationId || (context.isAdminContext || context.isDemoMode ? context.effectiveLocationId : undefined),
    demoLocationId: context.isDemoMode ? context.effectiveLocationId : undefined,
    sourceId: context.sourceId,
    type: context.type,
    demo: context.isDemoMode,
    fromDemoCenter: context.fromDemoCenter,
  };
  return <MenuEditorClient initialData={data} locationId={context.effectiveLocationId} contextKey={context.isAdminContext || context.isDemoMode ? "adminLocationId" : "locationId"} mode={context.isAdminContext ? "admin" : "business"} returnHref={returnHref} embedded contextPayload={contextPayload} />;
}
