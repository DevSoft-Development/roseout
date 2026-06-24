"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";

type Market = "NYC_CORE" | "LONG_ISLAND" | "WESTCHESTER" | "NORTHERN_NJ" | "OTHER";
type ImportType = "both" | "restaurants" | "activities";
type Preset = "strict" | "standard" | "hours_optional" | "photo_optional" | "discovery";
type Quality = { requireWebsite: boolean; requirePhone: boolean; requireLocation: boolean; requirePhoto: boolean; requireCuisineType: boolean; requireHours: boolean };
type Submitted = Quality & { type: ImportType; limit: number; maxQueries: number; batch: string; primaryTag: string; areas: string; market: Market; requestedMarket: Market; minRating: number; allowMarketCorrection: boolean; qualityPreset: Preset };

type ImportSummary = { statusTone: "success" | "warning" | "error"; headline: string; explanation: string; stats: Array<{ label: string; value: string }>; qualityFilters: string; nextSteps: string[] };
type AddedLocation = { id?: string; name: string; locationType?: string; market?: string; city?: string; address?: string; category?: string; rating?: string; website?: string; phone?: string; hasPhoto: boolean; hasHours: boolean };

const MARKET_AREAS: Record<Market, string[]> = {
  NYC_CORE: ["nyc", "Manhattan", "Brooklyn", "Queens", "Bronx", "Staten Island", "Harlem", "Williamsburg Brooklyn", "Long Island City Queens", "Astoria Queens", "Flushing Queens", "Jamaica Queens", "Downtown Brooklyn", "DUMBO Brooklyn", "Bushwick Brooklyn", "Chelsea Manhattan", "Midtown Manhattan", "Lower East Side Manhattan", "SoHo Manhattan", "Upper East Side Manhattan", "Upper West Side Manhattan"],
  LONG_ISLAND: ["Long Island", "Nassau County NY", "Suffolk County NY", "Garden City NY", "Mineola NY", "Hempstead NY", "Freeport NY", "Valley Stream NY", "Rockville Centre NY", "Westbury NY", "Huntington NY", "Melville NY", "Babylon NY", "Patchogue NY", "Riverhead NY", "Montauk NY", "Long Beach NY"],
  WESTCHESTER: ["Westchester County NY", "Yonkers NY", "White Plains NY", "New Rochelle NY", "Mount Vernon NY", "Scarsdale NY", "Rye NY", "Port Chester NY", "Tarrytown NY", "Dobbs Ferry NY", "Bronxville NY", "Mamaroneck NY", "Peekskill NY", "Ossining NY"],
  NORTHERN_NJ: ["Northern NJ", "Newark NJ", "Jersey City NJ", "Hoboken NJ", "Montclair NJ", "Fort Lee NJ", "Hackensack NJ", "Teaneck NJ", "Englewood NJ", "Edgewater NJ", "Paramus NJ", "Ridgewood NJ", "Elizabeth NJ", "Paterson NJ", "Morristown NJ"],
  OTHER: ["Custom area"],
};

const CATEGORIES = ["all", "rooftop", "hookah", "lounge", "brunch", "birthday", "romantic", "nightlife", "live music", "bowling", "arcade", "escape room", "spa", "museum", "comedy", "karaoke", "paint and sip", "wine bar", "cocktail bar", "seafood", "italian", "caribbean", "soul food", "steakhouse", "mexican", "mediterranean", "dessert", "cafe"];
const CATEGORY_LABELS: Record<string, string> = { all: "All categories" };
const TYPE_LABELS: Record<ImportType, string> = { both: "Both restaurants and activities", restaurants: "Restaurants only", activities: "Activities only" };
const PRESETS: Record<Preset, { label: string; description: string; quality: Quality }> = {
  strict: { label: "Strict quality import", description: "Best for public searchable locations. Requires website, phone, address, at least 1 photo, cuisine/type/category, and business hours.", quality: { requireWebsite: true, requirePhone: true, requireLocation: true, requirePhoto: true, requireCuisineType: true, requireHours: true } },
  standard: { label: "Standard import", description: "Good balance. Requires website, address, at least 1 photo, cuisine/type/category, and business hours. Phone is optional.", quality: { requireWebsite: true, requirePhone: false, requireLocation: true, requirePhoto: true, requireCuisineType: true, requireHours: true } },
  hours_optional: { label: "Hours optional import", description: "Good when Google has strong location data but no hours. Requires website, address, at least 1 photo, and cuisine/type/category. Hours and phone are optional.", quality: { requireWebsite: true, requirePhone: false, requireLocation: true, requirePhoto: true, requireCuisineType: true, requireHours: false } },
  photo_optional: { label: "Photo optional import", description: "Useful when Google has good data but no photo. Requires website, address, cuisine/type/category, and business hours. Photo and phone are optional.", quality: { requireWebsite: true, requirePhone: false, requireLocation: true, requirePhoto: false, requireCuisineType: true, requireHours: true } },
  discovery: { label: "Discovery scan", description: "Broad scan. Only requires address/location. Use this for finding possible leads that may need cleanup.", quality: { requireWebsite: false, requirePhone: false, requireLocation: true, requirePhoto: false, requireCuisineType: false, requireHours: false } },
};

function titleize(value: string) { return CATEGORY_LABELS[value] || value.replace(/\b\w/g, (c) => c.toUpperCase()); }
function readCount(result: Record<string, unknown> | null | undefined, keys: string[]) { for (const key of keys) if (typeof result?.[key] === "number") return String(result[key]); return "Not reported by the import route."; }
function qualityText(q: Quality) {
  const required = [q.requireWebsite && "website", q.requirePhone && "phone number", q.requireLocation && "address", q.requirePhoto && "at least 1 photo", q.requireCuisineType && "cuisine/type/category information", q.requireHours && "business hours"].filter(Boolean) as string[];
  const optional = [!q.requireWebsite && "website", !q.requirePhone && "phone number", !q.requireLocation && "address", !q.requirePhoto && "photo", !q.requireCuisineType && "cuisine/type/category information", !q.requireHours && "business hours"].filter(Boolean) as string[];
  const requiredSentence = required.length ? `This import required each location to have ${required.join(", ").replace(/, ([^,]*)$/, ", and $1")}.` : "This import did not require extra Google quality fields.";
  return optional.length ? `${requiredSentence} ${optional.join(", ").replace(/, ([^,]*)$/, ", and $1")} ${optional.length === 1 ? "was" : "were"} not required for this run.` : requiredSentence;
}

function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === "object" && !Array.isArray(value)); }
function firstText(record: Record<string, unknown>, keys: string[]) { for (const key of keys) { const value = record[key]; if (value !== null && value !== undefined && String(value).trim()) return String(value).trim(); } return undefined; }
function firstBoolean(record: Record<string, unknown>, keys: string[]) { for (const key of keys) if (typeof record[key] === "boolean") return Boolean(record[key]); return undefined; }
function hasAnyValue(record: Record<string, unknown>, keys: string[]) { return keys.some((key) => { const value = record[key]; return Array.isArray(value) ? value.length > 0 : Boolean(value); }); }
function normalizeAddedLocation(value: unknown): AddedLocation | null {
  if (!isRecord(value)) return null;
  const name = firstText(value, ["name", "restaurant_name", "activity_name", "location_name", "title", "place_name"]);
  if (!name) return null;
  const hasPhoto = firstBoolean(value, ["hasPhoto", "has_photo", "has_photos"]) ?? hasAnyValue(value, ["photo_url", "image_url", "main_image", "images", "photos"]);
  const hasHours = firstBoolean(value, ["hasHours", "has_hours"]) ?? hasAnyValue(value, ["hours", "opening_hours", "current_opening_hours", "regularOpeningHours", "weekday_text"]);
  return {
    id: firstText(value, ["id", "location_id", "database_id"]),
    name,
    locationType: firstText(value, ["locationType", "location_type", "type", "kind"]),
    market: firstText(value, ["market", "requested_market", "market_key"]),
    city: firstText(value, ["city", "area", "borough", "neighborhood", "county"]),
    address: firstText(value, ["address", "formatted_address", "vicinity", "street_address"]),
    category: firstText(value, ["cuisine", "category", "primary_category", "primaryCategory", "activity_type", "food_type", "cuisine_type", "primary_tag"]),
    rating: firstText(value, ["rating", "google_rating"]),
    website: firstText(value, ["website", "website_url", "url"]),
    phone: firstText(value, ["phone", "phone_number", "formatted_phone_number", "international_phone_number"]),
    hasPhoto,
    hasHours,
  };
}
export function getAddedLocations(result: unknown): AddedLocation[] {
  if (!isRecord(result)) return [];
  const candidates = [result.addedLocations, result.importedLocations, result.createdLocations, result.insertedLocations, isRecord(result.results) ? result.results.imported : undefined, isRecord(result.details) ? result.details.imported : undefined, isRecord(result.summary) ? result.summary.addedLocations : undefined];
  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? list.map(normalizeAddedLocation).filter((location): location is AddedLocation => Boolean(location)) : [];
}
function yesNo(value: boolean) { return value ? "Yes" : "No"; }

export function buildImportSummary(result: Record<string, unknown> | null | undefined, submitted: Submitted | null): ImportSummary {
  const status = Number(result?.status || result?.httpStatus || 200);
  const errorMessage = String(result?.error || result?.message || "").trim();
  const imported = Number(result?.imported ?? result?.importedCount ?? 0);
  const skipped = Number(result?.skipped ?? result?.skippedCount ?? 0);
  const failed = Number(result?.failed ?? result?.failedCount ?? 0);
  const checked = Number(result?.checked ?? result?.checkedCount ?? result?.total_found_from_google ?? 0);
  const unauthorized = status === 401 || status === 403 || /unauthorized|forbidden/i.test(errorMessage);
  let statusTone: ImportSummary["statusTone"] = "success";
  let headline = "Google import finished.";
  if (!result || result.success === false || status >= 400) { statusTone = "error"; headline = unauthorized ? "Google import could not finish because authorization failed." : "Google import could not finish."; }
  else if (failed > 0 && imported > 0) { statusTone = "warning"; headline = "Google import partially completed."; }
  else if (imported === 0) { statusTone = "warning"; headline = "Google import finished, but no new locations were imported."; }
  const q = submitted || { requireWebsite: true, requirePhone: true, requireLocation: true, requirePhoto: true, requireCuisineType: true, requireHours: true, market: "NYC_CORE", areas: "nyc", type: "both", batch: "all", maxQueries: 2, limit: 10, minRating: 3.8, qualityPreset: "strict" } as Submitted;
  const skippedByReason = result?.skipped_by_reason && typeof result.skipped_by_reason === "object" ? result.skipped_by_reason as Record<string, unknown> : null;
  const skippedReasons = skippedByReason ? Object.entries(skippedByReason).map(([k, v]) => `${String(v)} ${String(k).replace(/_/g, " ")}`).join(", ") : "No detailed skip reasons were reported.";
  const hoursNote = q.requireHours ? "Business hours were required for this run." : "Business hours were not required for this run.";
  const missingHours = /hour/i.test(JSON.stringify(result?.skipped_by_reason || result?.errors || {})) ? " Missing hours appeared in the reported skip details." : "";
  const explanation = statusTone === "error" ? `The server returned: ${errorMessage || status}. ${unauthorized ? "This usually means your admin session expired, your account does not have permission, or the route is missing the correct admin auth check." : "Review the advanced response below before retrying."}` : `TheOutHaven searched ${q.areas} for ${q.batch === "all" ? "all categories" : q.batch} ${TYPE_LABELS[q.type].toLowerCase()} in the ${q.market} market. It checked ${checked || "the reported Google Places"} results, imported ${imported} new locations, skipped ${skipped}, and failed ${failed}. ${qualityText(q)} ${hoursNote}${missingHours}`;
  return { statusTone, headline, explanation, stats: [{ label: "Market", value: q.market }, { label: "Area searched", value: q.areas }, { label: "Location type", value: TYPE_LABELS[q.type] }, { label: "Category", value: titleize(q.batch) }, { label: "Google queries", value: String(Array.isArray(result?.queries_used) ? result.queries_used.length : q.maxQueries) }, { label: "Places checked", value: readCount(result, ["checked", "checkedCount", "total_found_from_google"]) }, { label: "Imported", value: readCount(result, ["imported", "importedCount"]) }, { label: "Skipped", value: readCount(result, ["skipped", "skippedCount"]) }, { label: "Failed", value: readCount(result, ["failed", "failedCount"]) }, { label: "Skip reasons", value: skippedReasons }], qualityFilters: qualityText(q), nextSteps: imported > 0 ? ["Review the imported locations for images, hours display, tags, and public search readiness.", "Run another small batch only after checking duplicates and skipped reasons."] : ["Try a broader category, a lower minimum rating, or the Hours optional import preset if Google is missing hours.", "Check whether the places were already in your database or outside the selected market."] };
}

function SelectField({ label, value, onChange, children, helper }: { label: string; value: string; onChange: (value: string) => void; children: React.ReactNode; helper?: string }) { return <label className="block text-sm font-black text-white/75">{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/50 px-4 py-3 text-white outline-none focus:border-rose-300">{children}</select>{helper ? <span className="mt-2 block text-xs font-bold leading-5 text-white/45">{helper}</span> : null}</label>; }

export function GoogleImportFormClient() {
  const [market, setMarket] = useState<Market>("NYC_CORE"); const [area, setArea] = useState(MARKET_AREAS.NYC_CORE[0]); const [customArea, setCustomArea] = useState("");
  const [type, setType] = useState<ImportType>("both"); const [category, setCategory] = useState("all"); const [customCategory, setCustomCategory] = useState("");
  const [maxQueries, setMaxQueries] = useState("2"); const [limit, setLimit] = useState("10"); const [minRating, setMinRating] = useState("3.8");
  const [preset, setPreset] = useState<Preset>("strict"); const [quality, setQuality] = useState<Quality>(PRESETS.strict.quality); const [manual, setManual] = useState(false); const [allowMarketCorrection, setAllowMarketCorrection] = useState(false);
  const [busy, setBusy] = useState(false); const [result, setResult] = useState<Record<string, unknown> | null>(null); const [submitted, setSubmitted] = useState<Submitted | null>(null); const [showSlowMessage, setShowSlowMessage] = useState(false);
  const summary = useMemo(() => result ? buildImportSummary(result, submitted) : null, [result, submitted]);
  const addedLocations = useMemo(() => getAddedLocations(result), [result]);
  useEffect(() => { if (!busy) { setShowSlowMessage(false); return; } const timer = window.setTimeout(() => setShowSlowMessage(true), 15000); return () => window.clearTimeout(timer); }, [busy]);
  function changeMarket(value: string) { const next = value as Market; setMarket(next); setArea(MARKET_AREAS[next][0]); setCustomArea(""); }
  function changePreset(value: string) { const next = value as Preset; setPreset(next); if (!manual) setQuality(PRESETS[next].quality); }
  function toggle(key: keyof Quality) { setManual(true); setQuality((q) => ({ ...q, [key]: !q[key] })); }
  async function submit(e: FormEvent) { e.preventDefault(); if (busy) return; setBusy(true); setResult(null); const batch = customCategory.trim() || category; const areas = customArea.trim() || area; const body: Submitted = { type, limit: Number(limit), maxQueries: Number(maxQueries), batch, primaryTag: batch, areas, market, requestedMarket: market, minRating: Number(minRating), ...quality, allowMarketCorrection, qualityPreset: preset }; setSubmitted(body); try { const res = await fetch("/api/admin/run-google-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const text = await res.text(); let json: Record<string, unknown>; try { json = text ? JSON.parse(text) as Record<string, unknown> : {}; } catch { json = { raw: text }; } setResult({ status: res.status, ok: res.ok, ...json }); } catch (error) { setResult({ success: false, error: error instanceof Error ? error.message : String(error) }); } finally { setBusy(false); } }
  return <form onSubmit={submit} className="space-y-6">
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      <SelectField label="Market" value={market} onChange={changeMarket}>{Object.keys(MARKET_AREAS).map((m) => <option key={m}>{m}</option>)}</SelectField>
      <SelectField label="Area/search location" value={area} onChange={setArea}>{MARKET_AREAS[market].map((a) => <option key={a}>{a}</option>)}</SelectField>
      <SelectField label="Location type" value={type} onChange={(v) => setType(v as ImportType)}>{Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
      <SelectField label="Import category/batch" value={category} onChange={setCategory}>{CATEGORIES.map((c) => <option key={c} value={c}>{titleize(c)}</option>)}</SelectField>
      <SelectField label="Max Google queries" value={maxQueries} onChange={setMaxQueries}>{[1,2,3,5,8,10,12].map((n) => <option key={n}>{n}</option>)}</SelectField>
      <SelectField label="Import limit" value={limit} onChange={setLimit}>{[5,10,15,20,25].map((n) => <option key={n}>{n}</option>)}</SelectField>
      <SelectField label="Minimum rating" value={minRating} onChange={setMinRating}>{[["0", "No rating minimum"], ["3.5", "3.5+"], ["3.8", "3.8+"], ["4.0", "4.0+"], ["4.2", "4.2+"], ["4.5", "4.5+"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</SelectField>
      <SelectField label="Required quality preset" value={preset} onChange={changePreset} helper={PRESETS[preset].description}>{Object.entries(PRESETS).map(([v,p]) => <option key={v} value={v}>{p.label}</option>)}</SelectField>
      <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-black/30 p-4 text-sm font-bold text-white/70"><input type="checkbox" checked={allowMarketCorrection} onChange={(e) => setAllowMarketCorrection(e.target.checked)} className="mt-1" /><span>Allow market correction<span className="block pt-1 text-xs text-white/45">When off, imports are rejected if Google returns a location outside the selected market.</span></span></label>
    </div>
    <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-black text-white/75">Advanced custom area override<input value={customArea} onChange={(e) => setCustomArea(e.target.value)} placeholder="Use this only when the area is not listed above." className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-rose-300" /><span className="mt-2 block text-xs font-bold text-white/45">Use this only when the area is not listed above.</span></label><label className="text-sm font-black text-white/75">Advanced custom category override<input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} className="mt-2 w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-white outline-none focus:border-rose-300" /></label></div>
    <div className="rounded-2xl border border-rose-300/20 bg-rose-500/10 p-4 text-sm font-bold leading-6 text-rose-50">{qualityText(quality)}</div>
    <details className="rounded-2xl border border-white/10 bg-black/25 p-4"><summary className="cursor-pointer text-sm font-black text-white">Advanced manual quality filters</summary>{manual ? <p className="mt-3 text-xs font-bold text-amber-100">Manual quality filters are overriding the selected preset.</p> : null}<div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{([["requireWebsite", "Require website"], ["requirePhone", "Require phone"], ["requireLocation", "Require address/location"], ["requirePhoto", "Require at least 1 photo"], ["requireCuisineType", "Require cuisine/type/category"], ["requireHours", "Require business hours"]] as Array<[keyof Quality,string]>).map(([k,l]) => <label key={k} className="flex gap-3 text-sm font-bold text-white/70"><input type="checkbox" checked={quality[k]} onChange={() => toggle(k)} />{l}{k === "requireHours" ? <span className="text-white/40">Requires Google to return opening hours or weekday hours for the location.</span> : null}</label>)}</div><button type="button" onClick={() => { setQuality(PRESETS[preset].quality); setManual(false); }} className="mt-4 rounded-full bg-white px-4 py-2 text-xs font-black text-black">Reset to selected preset</button></details>
    <button disabled={busy} className="rounded-full bg-rose-500 px-6 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/40 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Running import…" : "Run Google Import"}</button>
    {busy && submitted ? <section className="overflow-hidden rounded-3xl border border-rose-300/25 bg-[radial-gradient(circle_at_top_left,rgba(236,11,91,.28),transparent_34%),rgba(12,8,12,.92)] p-5 shadow-2xl shadow-rose-950/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Import running</p><h3 className="mt-2 text-xl font-black text-white">Import is running. This page will update when the server returns the final result.</h3>{showSlowMessage ? <p className="mt-2 text-sm font-bold text-amber-100">Still working. Larger imports can take longer because Google results are being checked and saved.</p> : null}</div><div className="rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-xs font-black uppercase tracking-widest text-white/50">Single request · live status pending</div></div>
      <div className="mt-5 h-3 overflow-hidden rounded-full border border-rose-200/20 bg-black/50"><div className="h-full w-1/3 animate-[pulse_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-rose-700 via-rose-300 to-fuchsia-400 shadow-[0_0_24px_rgba(244,63,94,.65)]" /></div>
      <ol className="mt-5 grid gap-2 md:grid-cols-5">{["Preparing import request", "Searching Google Places", "Checking quality requirements", "Saving new locations", "Building import report"].map((step, index) => <li key={step} className="rounded-2xl border border-white/10 bg-black/25 p-3 text-xs font-bold leading-5 text-white/65"><span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-rose-200">Step {index + 1}</span>{step}</li>)}</ol>
      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{[["Market", submitted.market], ["Area", submitted.areas], ["Location type", TYPE_LABELS[submitted.type]], ["Category", titleize(submitted.batch)], ["Max queries", String(submitted.maxQueries)], ["Import limit", String(submitted.limit)], ["Minimum rating", String(submitted.minRating)], ["Quality preset", PRESETS[submitted.qualityPreset].label]].map(([label, value]) => <div key={label} className="rounded-2xl bg-black/30 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-white/35">{label}</p><p className="mt-1 text-sm font-bold text-white/80">{value}</p></div>)}</div>
    </section> : null}
    {summary ? <section className={`rounded-3xl border p-5 ${summary.statusTone === "error" ? "border-red-300/30 bg-red-500/10" : summary.statusTone === "warning" ? "border-amber-300/30 bg-amber-500/10" : "border-emerald-300/30 bg-emerald-500/10"}`}><h3 className="text-xl font-black">{summary.headline}</h3><p className="mt-2 text-sm font-bold leading-6 text-white/70">{summary.explanation}</p><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{summary.stats.map((s) => <div key={s.label} className="rounded-2xl bg-black/30 p-3"><p className="text-xs font-black uppercase tracking-widest text-white/40">{s.label}</p><p className="mt-1 text-sm font-bold text-white/80">{s.value}</p></div>)}</div><h4 className="mt-5 text-sm font-black">Quality filters used</h4><p className="mt-2 text-sm font-bold text-white/65">{summary.qualityFilters}</p><h4 className="mt-5 text-sm font-black">What should I do next?</h4><ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-bold text-white/65">{summary.nextSteps.map((n) => <li key={n}>{n}</li>)}</ul><section className="mt-5 rounded-3xl border border-white/10 bg-black/25 p-4"><h4 className="text-base font-black text-white">Locations added</h4>{addedLocations.length ? <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs font-black uppercase tracking-widest text-white/40"><tr>{["Name", "Type", "Market", "City or area", "Address", "Category/cuisine/type", "Rating", "Website", "Phone", "Has photo", "Has business hours", "Database ID"].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/10">{addedLocations.map((location, index) => <tr key={location.id || `${location.name}-${index}`} className="align-top text-white/70"><td className="min-w-[180px] px-3 py-3 font-black text-white">{location.id ? <Link className="text-rose-100 hover:text-white hover:underline" href={`/admin/dashboard/crm/${location.id}`}>{location.name}</Link> : location.name}</td><td className="px-3 py-3">{location.locationType || "—"}</td><td className="px-3 py-3">{location.market || "—"}</td><td className="px-3 py-3">{location.city || "—"}</td><td className="min-w-[220px] px-3 py-3">{location.address || "—"}</td><td className="px-3 py-3">{location.category || "—"}</td><td className="px-3 py-3">{location.rating || "—"}</td><td className="px-3 py-3">{location.website ? <a href={location.website} target="_blank" rel="noreferrer" className="text-rose-100 underline">Website</a> : "—"}</td><td className="px-3 py-3">{location.phone || "—"}</td><td className="px-3 py-3">{yesNo(location.hasPhoto)}</td><td className="px-3 py-3">{yesNo(location.hasHours)}</td><td className="px-3 py-3 font-mono text-xs text-white/45">{location.id || "—"}</td></tr>)}</tbody></table></div> : <div className="mt-3 rounded-2xl border border-amber-200/15 bg-amber-500/10 p-4 text-sm font-bold leading-6 text-amber-50"><p>No new locations were added during this run.</p><p className="mt-2 text-white/65">Try relaxing the quality preset, choosing a different category, increasing the query count, or selecting a nearby area.</p></div>}</section><details className="mt-5"><summary className="cursor-pointer text-sm font-black text-white">Advanced raw import response</summary><pre className="mt-3 max-h-[360px] overflow-auto rounded-2xl bg-black/60 p-4 text-xs text-white/70">{JSON.stringify(result, null, 2)}</pre></details></section> : null}
  </form>;
}
