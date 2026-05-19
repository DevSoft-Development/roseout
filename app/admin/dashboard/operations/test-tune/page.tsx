"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type WarningItem = {
  id?: string;
  name: string;
  type: "restaurant" | "activity";
  city?: string | null;
  state?: string | null;
  reason?: string;
  warnings?: string[];
};

type QaReport = {
  query: string;
  top_restaurants: WarningItem[];
  top_activities: WarningItem[];
};

type Qa = { reports?: QaReport[]; error?: string };

type Severity = "high" | "medium" | "low";

type WarningRow = {
  id: string;
  locationId?: string;
  locationName: string;
  locationType: "restaurant" | "activity";
  city: string;
  state: string;
  warningType: string;
  reason: string;
  recommendedFix: string;
  severity: Severity;
  editHref: string;
};

const WARNING_CONFIG: Record<string, { label: string; recommendedFix: string; severity: Severity }> = {
  "missing semantic_search_text": { label: "Missing semantic_search_text", recommendedFix: "Run Backfill Semantic Data, then Run Semantic Cleanup.", severity: "high" },
  "missing intent_tags": { label: "Missing intent_tags", recommendedFix: "Use Rebuild Intent Tags, then re-run Search QA.", severity: "high" },
  "missing coordinates": { label: "Missing coordinates", recommendedFix: "Run Fix Missing Coordinates and verify geocoding.", severity: "high" },
  "mismatched city/state (NYC city with non-NY state)": { label: "Mismatched city/state", recommendedFix: "Correct city/state in location edit and save.", severity: "medium" },
  "dessert query returned likely unrelated candle/dance/fitness/class result": { label: "Bad intent/category match", recommendedFix: "Tune category/intents and semantic text for this location.", severity: "medium" },
  "restaurant search returned activity-only looking place": { label: "Bad intent/category match", recommendedFix: "Align type/category and intent tags to restaurant taxonomy.", severity: "medium" },
  "walking distance query returned distance over realistic threshold (>2 miles)": { label: "Walking distance warning", recommendedFix: "Validate coordinates; adjust ranking bias for distance relevance.", severity: "low" },
};

const FILTER_ALL = "All";

export default function AdminTestTunePage() {
  const [qa, setQa] = useState<Qa | null>(null);
  const [msg, setMsg] = useState<string>("");
  const [loading, setLoading] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState(FILTER_ALL);
  const [locationTypeFilter, setLocationTypeFilter] = useState(FILTER_ALL);
  const [cityFilter, setCityFilter] = useState(FILTER_ALL);
  const [stateFilter, setStateFilter] = useState(FILTER_ALL);
  const [severityFilter, setSeverityFilter] = useState(FILTER_ALL);

  const isFilteredView = [typeFilter, locationTypeFilter, cityFilter, stateFilter, severityFilter].some((value) => value !== FILTER_ALL);

  const run = async (label: string, url: string) => {
    setLoading(label);
    setMsg("");
    try {
      const res = await fetch(url, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setMsg(data.error || `${label} failed`);
      else {
        setMsg(`${label} complete.`);
        if (label === "Run Search QA") setQa(data);
      }
    } catch {
      setMsg(`${label} unavailable. Check route or server logs.`);
    } finally {
      setLoading(null);
    }
  };

  const warningRows = useMemo<WarningRow[]>(() => {
    const rows: WarningRow[] = [];
    for (const report of qa?.reports || []) {
      for (const item of [...report.top_restaurants, ...report.top_activities]) {
        for (const warning of item.warnings || []) {
          const config = WARNING_CONFIG[warning];
          const locationType = item.type;
          const locationId = typeof item.id === "string" || typeof item.id === "number" ? String(item.id) : undefined;
          rows.push({
            id: `${report.query}-${locationType}-${locationId || item.name}-${warning}`,
            locationId,
            locationName: item.name,
            locationType,
            city: (item.city || "—").toString(),
            state: (item.state || "—").toString(),
            warningType: config?.label || warning,
            reason: item.reason || "No reason provided",
            recommendedFix: config?.recommendedFix || "Review the location metadata and rerun Search QA.",
            severity: config?.severity || "low",
            editHref: locationId ? `/admin/dashboard/locations/edit/${locationType === "restaurant" ? "restaurants" : "activities"}/${locationId}?from=/admin/dashboard/operations/test-tune` : "/admin/dashboard/locations",
          });
        }
      }
    }
    return rows;
  }, [qa]);

  const filteredRows = warningRows.filter((row) => {
    if (typeFilter !== FILTER_ALL && row.warningType !== typeFilter) return false;
    if (locationTypeFilter !== FILTER_ALL && row.locationType !== locationTypeFilter) return false;
    if (cityFilter !== FILTER_ALL && row.city !== cityFilter) return false;
    if (stateFilter !== FILTER_ALL && row.state !== stateFilter) return false;
    if (severityFilter !== FILTER_ALL && row.severity !== severityFilter.toLowerCase()) return false;
    return true;
  });

  const warningBreakdown = [
    "Missing semantic_search_text",
    "Missing intent_tags",
    "Missing coordinates",
    "Mismatched city/state",
    "Bad intent/category match",
    "Walking distance warning",
  ].map((label) => ({ label, count: warningRows.filter((r) => r.warningType === label).length }));

  const unique = (values: string[]) => [FILTER_ALL, ...Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b))];

  return <main className="min-h-screen bg-[#090706] px-4 py-8 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-7xl space-y-6"><header className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"><p className="text-xs font-black uppercase tracking-[0.25em] text-rose-200">Operations</p><h1 className="mt-2 text-3xl font-black">Test + Tune</h1><p className="mt-2 text-sm text-white/65">Run Search QA and semantic tools, then take action on warnings. Resolved items disappear after re-running Search QA.</p></header>
  <section className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-2 lg:grid-cols-6"><button onClick={()=>run("Run Search QA","/api/admin/search-qa")} disabled={Boolean(loading)} className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-black">{loading==="Run Search QA"?"Running...":"Re-run Search QA"}</button><button onClick={()=>run("Backfill Semantic Data","/api/admin/semantic-nightly?all=true&limit=100")} disabled={Boolean(loading)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black">{loading==="Backfill Semantic Data"?"Running...":"Backfill Semantic Data"}</button><button onClick={()=>run("Run Semantic Cleanup","/api/admin/semantic-nightly")} disabled={Boolean(loading)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black">{loading==="Run Semantic Cleanup"?"Running...":"Run Semantic Cleanup"}</button><button onClick={()=>run("Force Repair Missing Semantic Fields","/api/admin/semantic-nightly?repair=true&limit=100")} disabled={Boolean(loading)} className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm font-black">{loading==="Fix Missing Semantic Fields"?"Running...":"Fix Missing Semantic Fields"}</button><button onClick={()=>run("Fix Missing Coordinates","/api/admin/locations/cleanup-missing-address")} disabled={Boolean(loading)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black">{loading==="Fix Missing Coordinates"?"Running...":"Fix Missing Coordinates"}</button><button onClick={()=>run("Rebuild Intent Tags","/api/admin/semantic-nightly?repair=true&limit=100")} disabled={Boolean(loading)} className="rounded-xl border border-white/15 px-4 py-3 text-sm font-black">{loading==="Rebuild Intent Tags"?"Running...":"Rebuild Intent Tags"}</button></section>
  {msg && <p className="text-sm text-white/70">{msg}</p>}
  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Warnings Snapshot</h2><p className="mt-2 text-sm text-white/65">Total actionable warnings from current Search QA run.</p><p className="mt-3 text-3xl font-black text-amber-200">{warningRows.length}</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{warningBreakdown.map((card)=><div key={card.label} className="rounded-2xl border border-white/10 bg-[#14110f] p-4"><p className="text-xs uppercase tracking-[0.18em] text-white/55">{card.label}</p><p className="mt-2 text-2xl font-black text-white">{card.count}</p></div>)}</div></section>
  <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h3 className="text-lg font-black">Filters</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[
    { label: "Warning type", value: typeFilter, set: setTypeFilter, options: unique(warningRows.map((r) => r.warningType)) },
    { label: "Location type", value: locationTypeFilter, set: setLocationTypeFilter, options: unique(warningRows.map((r) => r.locationType)) },
    { label: "City", value: cityFilter, set: setCityFilter, options: unique(warningRows.map((r) => r.city)) },
    { label: "State", value: stateFilter, set: setStateFilter, options: unique(warningRows.map((r) => r.state)) },
    { label: "Severity", value: severityFilter, set: setSeverityFilter, options: [FILTER_ALL, "High", "Medium", "Low"] },
  ].map((f)=><label key={f.label} className="text-xs font-black uppercase tracking-[0.16em] text-white/60">{f.label}<select value={f.value} onChange={(e)=>f.set(e.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#151210] px-3 py-2 text-sm normal-case tracking-normal text-white">{f.options.map((o)=><option key={o} value={o}>{o}</option>)}</select></label>)}</div></section>
  <p className="text-xs font-bold uppercase tracking-[0.14em] text-white/60">{isFilteredView ? "Checking filtered results only" : "Checking all locations"}</p>
  <section className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03]"><div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-white/[0.04] text-left text-xs uppercase tracking-[0.16em] text-white/60"><tr><th className="px-4 py-3">Location</th><th className="px-4 py-3">Type/Category</th><th className="px-4 py-3">City/State</th><th className="px-4 py-3">Warning Type</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Recommended Fix</th><th className="px-4 py-3">Action</th></tr></thead><tbody>{filteredRows.map((row)=><tr key={row.id} className="border-t border-white/10 align-top hover:bg-white/[0.03]"><td className="px-4 py-3"><Link href={row.editHref} className="font-black text-rose-200 hover:text-rose-100">{row.locationName}</Link></td><td className="px-4 py-3 capitalize text-white/80">{row.locationType}</td><td className="px-4 py-3 text-white/80">{row.city}, {row.state}</td><td className="px-4 py-3 text-amber-200">{row.warningType}</td><td className="px-4 py-3 text-white/70">{row.reason}</td><td className="px-4 py-3 text-white/70">{row.recommendedFix}</td><td className="px-4 py-3"><Link href={row.editHref} className="inline-flex rounded-lg border border-white/15 px-3 py-2 text-xs font-black">Open / Edit</Link></td></tr>)}</tbody></table></div>{filteredRows.length===0 && <p className="p-5 text-sm text-white/65">No warnings match the filters. If you fixed data, re-run Search QA to refresh and resolve warnings.</p>}</section></div></main>;
}
