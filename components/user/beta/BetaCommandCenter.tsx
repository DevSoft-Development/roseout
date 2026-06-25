"use client";

import { useMemo, useState } from "react";

type Assignment = {
  id: string;
  status?: string | null;
  test_mode?: boolean | null;
  beta_tasks?: any;
  real_assignment_id?: string | null;
  is_virtual_weekly_session?: boolean | null;
};
type ResultItem = Record<string, any>;
type PairItem = Record<string, any>;
type Mode = "single_location" | "paired_outing";

const card = "rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-5 shadow-2xl shadow-black/20";
const input = "rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-rose-200/50";
const primary = "rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg shadow-rose-950/30 disabled:cursor-not-allowed disabled:opacity-50";
const secondary = "rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs font-black text-white hover:border-rose-200/40 disabled:cursor-not-allowed disabled:opacity-50";

const WEEKS = [
  { theme: "Test the Search Match", steps: ["Write your outing", "Review the results", "Select the best match", "Answer feedback questions", "Complete weekly check-in"] },
  { theme: "Improve My Outing Results", steps: ["Write your outing", "Review first results", "Refine your search", "Compare updated results", "Submit feedback"] },
  { theme: "Build My Outing Plan", steps: ["Start with an outing you would actually plan", "Save your favorite results", "Choose your top pick", "Check planning details", "Submit feedback"] },
  { theme: "Ready to Go", steps: ["Search for an outing you would actually book or visit", "Choose the result you would act on", "Check booking or visit details", "Complete trust and confidence check", "Submit final feedback"] },
];
const pairWords = [" and ", "after", "then", "brunch and", "restaurant and", "dinner and", "food and", "activity", "dessert", "lounge", "drinks", "museum and", "with food"];
const firstWeekStart = new Date("2026-06-22T00:00:00Z");
function currentProgramWeek(weekStart: string) { const d = new Date(`${weekStart}T00:00:00Z`); const diff = Math.floor((d.getTime() - firstWeekStart.getTime()) / 604800000) + 1; return Math.min(4, Math.max(1, Number.isFinite(diff) ? diff : 1)); }
function resultName(r: ResultItem) { return r.name || r.restaurant_name || r.activity_name || r.business_name || r.title || "TheOutHaven result"; }
function areaFor(r: ResultItem) { return [r.neighborhood || r.borough || r.area, r.city].filter(Boolean).join(", ") || r.address || "Location details available"; }
function categoryFor(r: ResultItem) { return r.primary_category || r.category || r.cuisine || r.activity_type || r.type || "Recommended place"; }
function getResultKind(item: any): "restaurant" | "activity" | "unknown" {
  const raw = String(
    item?.location_type ||
    item?.source_table ||
    item?.type ||
    item?.category ||
    item?.primary_category ||
    ""
  ).toLowerCase();

  if (raw.includes("restaurant") || raw.includes("food") || raw.includes("dinner") || raw.includes("cuisine")) {
    return "restaurant";
  }

  if (raw.includes("activity") || raw.includes("experience") || raw.includes("bowling") || raw.includes("venue")) {
    return "activity";
  }

  if (item?.restaurant_name || item?.cuisine) return "restaurant";
  if (item?.activity_name || item?.activity_type) return "activity";

  return "unknown";
}
function keyFor(r: ResultItem, i: number) { return String(r.id || r.source_id || r.location_id || r.pair_id || `${resultName(r)}-${i}`); }
function normalizeResults(data: any) {
  const restaurants = Array.isArray(data?.restaurants) ? data.restaurants.slice(0, 8) : [];
  const activities = Array.isArray(data?.activities) ? data.activities.slice(0, 8) : [];
  const cards = Array.isArray(data?.cards) ? data.cards : [];
  const matched = Array.isArray(data?.matched_locations) ? data.matched_locations : [];
  const pairs = Array.isArray(data?.pairs) ? data.pairs.slice(0, 3) : [];

  const fallbackSource = cards.length ? cards : matched;

  const fallbackRestaurants = fallbackSource
    .filter((item: any) => getResultKind(item) === "restaurant")
    .slice(0, 8);

  const fallbackActivities = fallbackSource
    .filter((item: any) => getResultKind(item) === "activity")
    .slice(0, 8);

  const finalRestaurants = restaurants.length ? restaurants : fallbackRestaurants;
  const finalActivities = activities.length ? activities : fallbackActivities;

  const fallbackResults = fallbackSource
    .filter((item: any) => getResultKind(item) !== "restaurant" && getResultKind(item) !== "activity")
    .slice(0, 8);

  return {
    restaurants: finalRestaurants,
    activities: finalActivities,
    fallbackResults,
    pairs,
    mode: pairs.length ? "paired_outing" as Mode : "single_location" as Mode,
  };
}
function pairTitle(p: PairItem) { return p.title || p.pair_title || `${resultName(p.restaurant || p.primary || p.first || {})} + ${resultName(p.activity || p.secondary || p.second || {})}`; }
function pairParts(p: PairItem) { return [p.restaurant || p.primary || p.first || p.location_a, p.activity || p.secondary || p.second || p.location_b].filter(Boolean); }
function readableList(values: string[]) { return values.length ? values.join(", ") : "Nothing else selected"; }

export default function BetaCommandCenter({ assignments, weekStart, giveawayStatus, feedbackCount, testMode = false }: { assignments: Assignment[]; weekStart: string; giveawayStatus?: string | null; feedbackCount: number; profileComplete: boolean; testMode?: boolean }) {
  const weekNumber = currentProgramWeek(weekStart);
  const week = WEEKS[weekNumber - 1];
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState("");
  const [runId, setRunId] = useState<string | null>(null);
  const [restaurants, setRestaurants] = useState<ResultItem[]>([]);
  const [activities, setActivities] = useState<ResultItem[]>([]);
  const [fallbackResults, setFallbackResults] = useState<ResultItem[]>([]);
  const [pairs, setPairs] = useState<PairItem[]>([]);
  const [mode, setMode] = useState<Mode>("single_location");
  const [selected, setSelected] = useState<any>(null);
  const [saved, setSaved] = useState<any[]>([]);
  const [refine, setRefine] = useState<string[]>([]);
  const [refineText, setRefineText] = useState("");
  const [feedback, setFeedback] = useState<Record<string, string>>({ match: "Mostly", q2: "Some were", vibe: "The vibe was close", missing: "Nothing was missing", notes: "" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const progress = useMemo(() => week.steps.map((label, i) => ({ label, status: i + 1 < step ? "Completed" : i + 1 === step ? "In progress" : "Not started" })), [step, week.steps]);
  const pairRequested = pairWords.some((w) => query.toLowerCase().includes(w));
  const activeAssignment = assignments[0];
  const activeTestMode = Boolean(testMode || activeAssignment?.test_mode);

  async function persist(action: string, payload: any) { const res = await fetch("/api/beta/guided", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, week_number: weekNumber, week_start_date: weekStart, beta_session_id: activeAssignment?.id, beta_assignment_id: activeAssignment?.real_assignment_id ?? null, test_mode: activeTestMode, ...payload }) }); const data = await res.json().catch(() => ({})); if (!res.ok || data.error) throw new Error(data.error || "Unable to save beta progress."); return data; }
  async function runSearch(updated = false) { if (!query.trim()) return; setBusy(true); setError(null); setNotice(null); try { const finalQuery = updated && (refine.length || refineText) ? `${query}. Please refine by: ${[...refine, refineText].filter(Boolean).join(", ")}` : query; const res = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: finalQuery, query: finalQuery, message: finalQuery, prompt: finalQuery, betaAssignmentId: activeAssignment?.real_assignment_id ?? undefined, usedCustomPrompt: true }) }); const data = await res.json(); if (!res.ok || data.error) throw new Error(data.user_message || "Search failed"); const normalized = normalizeResults(data); setRestaurants(normalized.restaurants); setActivities(normalized.activities); setFallbackResults(normalized.fallbackResults); setPairs(normalized.pairs); setMode(normalized.mode); const savedRun = await persist("search_run", { outing_sentence: query, enterprise_search_query_used: finalQuery, result_mode: normalized.mode, pair_requested: pairRequested || normalized.mode === "paired_outing", refinement_choices: updated ? refine : [], refinement_text: updated ? refineText : null, result_set: updated ? "updated" : "original", results: [...normalized.restaurants, ...normalized.activities, ...normalized.fallbackResults], pairs: normalized.pairs }); setRunId(savedRun.run?.id || runId); setStep(Math.max(step, updated ? 4 : 2)); setNotice(updated ? "Updated results are ready to compare." : "Real TheOutHaven search results are ready."); } catch (e: any) { setError(e.message || "We could not run that search. Please try again."); } finally { setBusy(false); } }
  function itemIdentity(item: any) { return String(item?.id || item?.pair_id || item?.source_id || item?.location_id || item?.google_place_id || item?.name || item?.title || ""); }
  function isSameItem(a: any, b: any) { const aId = itemIdentity(a); const bId = itemIdentity(b); return Boolean(aId && bId && aId === bId); }
  function isSelectedResult(item: any) { return Boolean(selected && !selected?.none && isSameItem(selected, item)); }
  function isSavedResult(item: any) { return saved.some((entry) => isSameItem(entry, item)); }
  async function choose(item: any, type: "single_location" | "paired_outing" | "none", flags: Record<string, boolean>) { setBusy(true); setError(null); setNotice(null); try { if (type !== "none" && !runId) { throw new Error("Search results are still being prepared. Please run the search again before selecting a result."); } const savedSelection = await persist("selection", { beta_search_run_id: runId, chosen_result_type: type, selected_none: type === "none", result: item, result_type: type, was_saved: false, ...flags }); setSelected(type === "none" ? { none: true } : item); setStep((current) => Math.max(current, weekNumber === 3 || weekNumber === 4 ? 3 : 4)); setNotice(type === "none" ? "Thanks — we recorded that none matched." : flags.was_saved ? "Saved for beta review." : "Your choice was saved for beta review."); return savedSelection; } catch (e: any) { setError(e.message || "We could not save that choice."); } finally { setBusy(false); } }
  async function saveItem(item: any, type: "single_location" | "paired_outing") { setBusy(true); setError(null); setNotice(null); try { if (!runId) { throw new Error("Search results are still being prepared. Please run the search again before saving a result."); } await persist("selection", { beta_search_run_id: runId, chosen_result_type: type, selected_none: false, result: item, result_type: type, was_saved: true, was_selected: false }); setSaved((current) => current.some((entry) => isSameItem(entry, item)) ? current : [...current, item]); setNotice(type === "paired_outing" ? "Pair saved for beta review." : "Result saved for beta review."); } catch (e: any) { setError(e.message || "We could not save that result."); } finally { setBusy(false); } }
  async function submitFeedback() { setBusy(true); setError(null); try { await persist("feedback", { beta_search_run_id: runId, result_mode: mode, selected_none: Boolean(selected?.none), feedback }); setStep(6); setNotice("Weekly beta check-in complete. Thank you for helping improve TheOutHaven."); } catch (e: any) { setError(e.message || "We could not submit feedback."); } finally { setBusy(false); } }

  return <div className="grid gap-6">
    <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,.2),transparent_32%),linear-gradient(135deg,#160d0c,#080407)] p-6 md:p-8"><p className="text-xs font-black uppercase tracking-[.32em] text-rose-200">TheOutHaven Beta · Week {weekNumber}{testMode ? " · Test mode" : ""}</p><h1 className="mt-3 text-4xl font-black md:text-5xl">Your 5 Beta Steps This Week</h1>{testMode && <p className="mt-3 rounded-2xl border border-sky-300/20 bg-sky-500/10 p-3 text-sm font-bold text-sky-100">This is a test run. It uses the real flow but will not count toward beta progress, giveaway eligibility, prize entries, or real analytics.</p>}<p className="mt-3 max-w-3xl text-white/70">Complete these 5 quick steps to help us improve TheOutHaven. You’ll write out the outing you’re looking for, review real search results, select what fits, and tell us how well we did.</p><div className="mt-6 grid gap-3 md:grid-cols-3"><Pill label="Theme" value={week.theme}/><Pill label="Giveaway" value={giveawayStatus === "verified" ? "Qualified for review" : "In progress"}/><Pill label="Feedback" value={`${feedbackCount} submitted`}/></div></section>
    <section className={card}><h2 className="text-2xl font-black">Progress tracker</h2><div className="mt-4 grid gap-2 md:grid-cols-5">{progress.map((p, i) => <div key={p.label} className="rounded-2xl border border-white/10 bg-black/25 p-3"><p className="text-[11px] font-black text-rose-100">Step {i + 1}</p><p className="mt-1 text-sm font-bold text-white/80">{p.label}</p><p className="mt-2 text-xs text-white/45">{p.status}</p></div>)}</div></section>
    {(notice || error) && <p className={`rounded-2xl border p-4 text-sm font-bold ${error ? "border-red-300/20 bg-red-500/10 text-red-100" : "border-emerald-300/20 bg-emerald-500/10 text-emerald-100"}`}>{error || notice}</p>}
    <section className={card}><p className="text-xs font-black uppercase tracking-[.28em] text-rose-200">Step 1</p><h2 className="mt-2 text-2xl font-black">Write out the outing you’re looking for in a real sentence.</h2><p className="mt-2 text-sm text-white/60">Tell us what kind of outing you want, who it’s for, where you want to go, the vibe, budget, or occasion. You can also ask for more than one part of an outing, like dinner and an activity.</p><form onSubmit={(e) => { e.preventDefault(); runSearch(false); }} className="mt-5 grid gap-3 md:grid-cols-[1fr_auto]"><input className={input} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Example: I’m looking for dinner and something fun to do after in Brooklyn with a grown, romantic vibe."/><button type="submit" disabled={busy || !query.trim()} className={primary}>{busy ? "Searching…" : "Find My Outing"}</button></form></section>
    {step >= 2 && <section className={card}><p className="text-xs font-black uppercase tracking-[.28em] text-rose-200">Step 2</p><h2 className="mt-2 text-2xl font-black">Review the results we found</h2><div className="mt-5 grid gap-6">{pairs.length > 0 && <BetaResultSection title="TheOutHaven Recommends" subtitle="Restaurant and activity combinations matched to your search.">{pairs.map((p, i) => <PairCard key={keyFor(p, i)} pair={p} disabled={busy} selected={isSelectedResult(p)} saved={isSavedResult(p)} onSelect={() => choose(p, "paired_outing", { was_selected: true })} onSave={() => saveItem(p, "paired_outing")}/>)}</BetaResultSection>}{restaurants.length > 0 && <BetaResultSection title="Restaurant Picks" subtitle="Food spots matched to cuisine, vibe, and location.">{restaurants.map((r, i) => <ResultCard key={keyFor(r, i)} result={r} type="restaurant" disabled={busy} selected={isSelectedResult(r)} saved={isSavedResult(r)} onSelect={() => choose(r, "single_location", { was_selected: true })} onSave={() => saveItem(r, "single_location")}/>)}</BetaResultSection>}{activities.length > 0 && <BetaResultSection title="Experience Picks" subtitle="Activities matched to your outing plan.">{activities.map((r, i) => <ResultCard key={keyFor(r, i)} result={r} type="activity" disabled={busy} selected={isSelectedResult(r)} saved={isSavedResult(r)} onSelect={() => choose(r, "single_location", { was_selected: true })} onSave={() => saveItem(r, "single_location")}/>)}</BetaResultSection>}{pairs.length === 0 && restaurants.length === 0 && activities.length === 0 && fallbackResults.length > 0 && <BetaResultSection title="More Matches" subtitle="Additional places matched to your search.">{fallbackResults.map((r, i) => <ResultCard key={keyFor(r, i)} result={r} type="unknown" disabled={busy} selected={isSelectedResult(r)} saved={isSavedResult(r)} onSelect={() => choose(r, "single_location", { was_selected: true })} onSave={() => saveItem(r, "single_location")}/>)}</BetaResultSection>}{pairs.length === 0 && restaurants.length === 0 && activities.length === 0 && fallbackResults.length === 0 && <div className="rounded-3xl border border-white/10 bg-black/25 p-5 text-sm font-bold text-white/65">No strong matches came back for this search. Try adding a borough, city, or vibe.</div>}</div><button type="button" disabled={busy} onClick={() => choose({ none: true }, "none", {})} className={`mt-4 ${secondary}`}>None of these match what I was looking for.</button></section>}
    {weekNumber === 2 && step >= 2 && <section className={card}><p className="text-xs font-black uppercase tracking-[.28em] text-rose-200">Step 3</p><h2 className="mt-2 text-2xl font-black">Refine your search</h2><div className="mt-4 flex flex-wrap gap-2">{["Change the location","Make it closer","Make it more affordable","Make it more upscale","Make it more romantic","Make it more fun","Show better paired outings","Show places closer together","Other"].map((x) => <button type="button" key={x} onClick={() => setRefine((r) => r.includes(x) ? r.filter((v) => v !== x) : [...r, x])} className={`rounded-full border px-3 py-2 text-xs font-black ${refine.includes(x) ? "border-rose-200 bg-rose-500/25" : "border-white/10 bg-black/25"}`}>{x}</button>)}</div><input className={`mt-3 w-full ${input}`} value={refineText} onChange={(e) => setRefineText(e.target.value)} placeholder="Example: Make it more upscale and keep both places within 15 minutes of each other."/><button type="button" disabled={busy} onClick={() => runSearch(true)} className={`mt-3 ${primary}`}>Update My Results</button></section>}
    {step >= 4 && <section className={card}><p className="text-xs font-black uppercase tracking-[.28em] text-rose-200">Feedback</p><h2 className="mt-2 text-2xl font-black">Tell us how well we did</h2><FeedbackFields weekNumber={weekNumber} mode={mode} feedback={feedback} setFeedback={setFeedback}/><button type="button" disabled={busy} onClick={submitFeedback} className={`mt-4 ${primary}`}>{weekNumber === 4 ? "Submit final feedback" : "Finish weekly check-in"}</button></section>}
    <section className={card}><h2 className="text-2xl font-black">Beta Help / Tips</h2><p className="mt-3 text-sm leading-6 text-white/65">Use real searches you would actually use for dates, birthdays, brunch, family outings, friend outings, or celebrations. If you ask for dinner and something after, TheOutHaven should use the same public search pipeline and show paired outings when available.</p><p className="mt-2 text-xs text-white/45">Saved this session: {saved.length ? `${saved.length} result${saved.length === 1 ? "" : "s"}` : "none yet"} · Selected: {selected?.none ? "None matched" : selected ? "Choice recorded" : "not selected yet"}</p></section>
  </div>;
}
function Pill({ label, value }: { label: string; value: string }) { return <div className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-[11px] font-black uppercase tracking-[.2em] text-rose-100">{label}</p><p className="mt-1 font-black text-white">{value}</p></div>; }
function BetaResultSection({ title, subtitle, children }: any) {
  return <div><div className="mb-3"><h3 className="text-xl font-black text-white">{title}</h3><p className="mt-1 text-sm text-white/55">{subtitle}</p></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div></div>;
}
function imageFor(item: any) {
  const candidates = [
    item?.image_url,
    item?.main_image,
    item?.photo_url,
    item?.photo,
    item?.google_photo_url,
    item?.cover_image,
    item?.hero_image,
    Array.isArray(item?.images) ? item.images[0] : null,
    Array.isArray(item?.photos) ? item.photos[0]?.url || item.photos[0] : null,
  ];

  const found = candidates.find((value) => typeof value === "string" && value.trim().length > 8);
  return found || "/toh_logo.png";
}
function ratingFor(item: any) { const value = Number(item?.rating || item?.google_rating || item?.average_rating); return Number.isFinite(value) && value > 0 ? value : null; }
function distanceFor(item: any) { const value = item?.distance_label || item?.distance_text; if (value) return String(value); const miles = Number(item?.distance_miles || item?.distance); return Number.isFinite(miles) && miles > 0 ? `${Math.round(miles * 10) / 10} mi` : null; }
function addressFor(item: any) { return item?.address || item?.formatted_address || item?.street_address || areaFor(item); }
function tagsFor(item: any) {
  const tags = [
    item?.primary_tag,
    item?.price_range,
    item?.vibe,
    ...(Array.isArray(item?.vibe_tags) ? item.vibe_tags : []),
    ...(Array.isArray(item?.review_keywords) ? item.review_keywords : []),
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ].filter(Boolean);

  return Array.from(new Set(tags.map(String))).slice(0, 4);
}
function whyFor(item: any, type?: string) { return item?.reason || item?.why_picked || item?.why_matched || item?.match_reason || item?.description || item?.review_snippet || `This ${type === "activity" ? "experience" : type === "restaurant" ? "food spot" : "place"} matched your real outing search.`; }
function ResultCard({ result, type, onSelect, onSave, disabled, selected, saved }: any) { const image = imageFor(result); const rating = ratingFor(result); const distance = distanceFor(result); const chips = tagsFor(result); return <article className="group flex h-full min-h-[460px] flex-col overflow-hidden rounded-[1.35rem] border border-white/10 bg-zinc-950/80 shadow-xl shadow-black/30 transition hover:border-[#e1062a]/55 hover:bg-[#141414]"><div className="relative h-[220px] overflow-hidden bg-neutral-950"><div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-950"><img src="/toh_logo.png" alt="" aria-hidden="true" className="h-10 w-10 object-contain opacity-50" /></div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={image} alt={resultName(result)} className="relative z-[1] h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.src = "/toh_logo.png"; event.currentTarget.className = "relative z-[1] h-full w-full object-contain p-12 opacity-70"; }}/><div className="absolute inset-0 z-[2] bg-gradient-to-t from-black/80 via-black/25 to-transparent"/><div className="absolute bottom-3 right-3 z-[3] flex flex-wrap justify-end gap-2">{distance && <span className="rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-black text-white backdrop-blur">{distance}</span>}{rating && <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-black">★ {rating}</span>}</div></div><div className="flex flex-1 flex-col p-4"><p className="line-clamp-1 text-[10px] font-black uppercase tracking-[.2em] text-[#e1062a]">{categoryFor(result) || type || "Recommended place"}</p><h3 className="mt-2 line-clamp-2 text-lg font-black leading-tight text-white">{resultName(result)}</h3><p className="mt-2 line-clamp-1 text-xs font-semibold text-white/45">{addressFor(result)}</p>{chips.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{chips.map((chip) => <span key={chip} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-white/75">{chip}</span>)}</div>}<div className="mt-3 rounded-xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[9px] font-black uppercase tracking-[.2em] text-white/35">Why TheOutHaven picked this</p><p className="mt-1.5 line-clamp-3 text-xs font-semibold leading-5 text-white/62">{whyFor(result, type)}</p></div><div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/10 pt-3"><button type="button" disabled={disabled} onClick={onSelect} className={secondary}>{selected ? "Selected" : "Select"}</button><button type="button" disabled={disabled} onClick={onSave} className={secondary}>{saved ? "Saved" : "Save"}</button></div></div></article>; }
function PairCard({ pair, onSelect, onSave, disabled, selected, saved }: any) { const parts = pairParts(pair); const firstKind = getResultKind(parts[0]); const secondKind = getResultKind(parts[1]); const bothActivityLike = firstKind === "activity" && secondKind === "activity"; const distance = pair.distance_text || pair.travel_fit || (pair.pair_distance_miles ? `${pair.pair_distance_miles} mi apart` : null); return <article className="group flex h-full min-h-[500px] flex-col overflow-hidden rounded-[1.35rem] border border-white/10 bg-zinc-950/80 p-3 shadow-xl shadow-black/30 transition hover:border-[#e1062a]/55 hover:bg-[#141414]"><div className="grid grid-cols-2 gap-2">{parts.slice(0, 2).map((part, index) => { const label = bothActivityLike ? (index === 0 ? "First Pick" : "Next Pick") : (getResultKind(part) === "restaurant" || index === 0 ? "Restaurant" : "Activity"); return <div key={`${label}-${index}`} className="relative h-40 overflow-hidden rounded-2xl bg-neutral-950"><div className="pointer-events-none absolute inset-0 flex items-center justify-center"><img src="/toh_logo.png" alt="" aria-hidden="true" className="h-8 w-8 object-contain opacity-50" /></div>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={imageFor(part)} alt={resultName(part)} className="relative z-[1] h-full w-full object-cover transition duration-700 group-hover:scale-[1.05]" loading="lazy" referrerPolicy="no-referrer" onError={(event) => { event.currentTarget.src = "/toh_logo.png"; event.currentTarget.className = "relative z-[1] h-full w-full object-contain p-8 opacity-70"; }}/><div className="absolute inset-0 z-[2] bg-gradient-to-t from-black/75 via-black/10 to-black/10"/><span className="absolute left-2 top-2 z-[3] rounded-full border border-white/15 bg-black/70 px-2 py-1 text-[9px] font-black uppercase tracking-[.14em] text-white backdrop-blur">{label}</span></div>; })}</div><div className="flex flex-1 flex-col p-2 pt-4"><p className="text-[10px] font-black uppercase tracking-[.2em] text-[#e1062a]">Recommended combo</p><h3 className="mt-2 line-clamp-2 text-lg font-black leading-tight text-white">{pairTitle(pair)}</h3><p className="mt-2 line-clamp-2 text-xs font-bold text-rose-100">{parts.map((p) => `${resultName(p)} (${categoryFor(p)})`).join(" → ")}</p>{distance && <p className="mt-3 w-fit rounded-full border border-[#e1062a]/35 bg-[#e1062a]/15 px-3 py-1 text-[11px] font-black text-red-50">{distance}</p>}<div className="mt-3 rounded-xl border border-white/10 bg-white/[0.045] p-3"><p className="text-[9px] font-black uppercase tracking-[.2em] text-white/35">Why TheOutHaven picked this</p><p className="mt-1.5 line-clamp-3 text-xs font-semibold leading-5 text-white/62">{pair.reason || pair.why_matched || pair.match_reason || "This paired outing matched your request for more than one part of an outing."}</p></div><div className="mt-auto grid grid-cols-2 gap-2 border-t border-white/10 pt-3"><button type="button" disabled={disabled} onClick={onSelect} className={secondary}>{selected ? "Pair selected" : "Select pair"}</button><button type="button" disabled={disabled} onClick={onSave} className={secondary}>{saved ? "Pair saved" : "Save pair"}</button></div></div></article>; }
function FeedbackFields({ weekNumber, mode, feedback, setFeedback }: any) { const q2 = mode === "paired_outing" ? "Were the paired outings the right combination of places?" : "Were the locations the right type of places?"; const planning = weekNumber === 3 ? "What details would you need before deciding?" : weekNumber === 4 ? "What would you need before you could take action?" : "What was missing or off about the results?"; return <div className="mt-4 grid gap-3"><Select label="Did the results match the outing you wrote?" value={feedback.match} onChange={(v: string) => setFeedback((f: any) => ({ ...f, match: v }))} options={["Yes, exactly","Mostly","Somewhat","Not really","Not at all"]}/><Select label={weekNumber === 2 ? "Which results are better?" : q2} value={feedback.q2} onChange={(v: string) => setFeedback((f: any) => ({ ...f, q2: v }))} options={weekNumber === 2 ? ["The updated results are better","The original results were better","Both were about the same","Neither matched what I wanted"] : ["Yes","Some were","No", mode === "paired_outing" ? "I did not select any pairs" : "I did not select any locations"]}/><Select label={weekNumber === 4 ? "How confident would you feel using this result for a real outing?" : "Did the results match the vibe or occasion you wanted?"} value={feedback.vibe} onChange={(v: string) => setFeedback((f: any) => ({ ...f, vibe: v }))} options={weekNumber === 4 ? ["Very confident","Somewhat confident","Not very confident","Not confident at all"] : ["Yes, the vibe was right","The vibe was close","The vibe was off","I did not have a specific vibe or occasion"]}/><Select label={planning} value={feedback.missing} onChange={(v: string) => setFeedback((f: any) => ({ ...f, missing: v }))} options={["Location was too far","Wrong borough or area","Price did not match","Vibe was wrong","Pairing did not make sense","The places were too far apart","Not enough details","Nothing was missing","Reservation or ticket link","Photos or reviews","Other"]}/><textarea className={input} value={feedback.notes} onChange={(e) => setFeedback((f: any) => ({ ...f, notes: e.target.value }))} placeholder={weekNumber === 4 ? "Example: I would trust it more if I could see reviews, photos, hours, and a reservation link on the same card." : "Example: I wanted dinner and a lounge that were closer together, not two places in different neighborhoods."}/></div>; }
function Select({ label, value, onChange, options }: any) { return <label className="grid gap-2"><span className="text-xs font-black uppercase tracking-[.18em] text-white/45">{label}</span><select className={input} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o: string) => <option key={o}>{o}</option>)}</select></label>; }
