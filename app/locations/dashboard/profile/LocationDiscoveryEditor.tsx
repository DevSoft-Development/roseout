"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Search, Tags, WandSparkles } from "lucide-react";

type LocationType = "restaurants" | "activities";
type DiscoveryState = {
  vibe_tags: string[];
  best_for_tags: string[];
  date_style_tags: string[];
  special_features: string[];
  search_keywords: string[];
  semantic_tags: string[];
};

const VIBES = ["Romantic","Cozy","Lively","Upscale","Casual","Intimate","Trendy","Energetic","Relaxed","Elegant","Fun","Quiet","Scenic","Artsy"];
const BEST_FOR = ["Date Night","First Date","Anniversary","Birthday","Girls Night","Guys Night","Groups","Family","Solo","Corporate Events","Proposal","Special Occasion"];
const DATE_STYLES = ["Casual Date","Romantic Date","Adventurous Date","Creative Date","Luxury Date","Low-Key Date","Active Date","Rainy Day Date"];
const FEATURES = ["Rooftop","Outdoor Seating","Live Music","DJ","Dancing","Waterfront","Private Dining","Craft Cocktails","BYOB","Late Night","Happy Hour","Games","Interactive","Hands-on","Indoor","Outdoor"];
const empty: DiscoveryState = { vibe_tags: [], best_for_tags: [], date_style_tags: [], special_features: [], search_keywords: [], semantic_tags: [] };

function normalize(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  return String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}
function unique(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => { const key = value.trim().toLowerCase(); if (!key || seen.has(key)) return false; seen.add(key); return true; });
}
function mergedSemantic(state: DiscoveryState) {
  return unique([...state.semantic_tags, ...state.vibe_tags, ...state.best_for_tags, ...state.date_style_tags, ...state.special_features, ...state.search_keywords]);
}

export default function LocationDiscoveryEditor({ locationId, locationType, demoMode }: { locationId: string; locationType: LocationType; demoMode?: boolean }) {
  const [state, setState] = useState<DiscoveryState>(empty);
  const [canonicalId, setCanonicalId] = useState(locationId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [customTag, setCustomTag] = useState("");
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [aiAccess, setAiAccess] = useState<{ paid: boolean; remaining: number | null; upgrade_required?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/locations/edit-context?type=${locationType}&id=${encodeURIComponent(locationId)}`, { cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.location) throw new Error(result.error || "Discovery details could not be loaded.");
        if (cancelled) return;
        const data = result.location;
        setCanonicalId(String(result.canonicalId || result.effectiveId || locationId));
        setState({
          vibe_tags: normalize(data.vibe_tags),
          best_for_tags: normalize(data.best_for_tags || data.best_for),
          date_style_tags: normalize(data.date_style_tags),
          special_features: normalize(data.special_features),
          search_keywords: normalize(data.search_keywords),
          semantic_tags: normalize(data.semantic_tags),
        });
      } catch (error) {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Discovery details could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [locationId, locationType]);

  const semanticPreview = useMemo(() => mergedSemantic(state), [state]);
  const toggle = (field: keyof DiscoveryState, value: string) => setState((current) => {
    const exists = current[field].some((item) => item.toLowerCase() === value.toLowerCase());
    return { ...current, [field]: exists ? current[field].filter((item) => item.toLowerCase() !== value.toLowerCase()) : [...current[field], value] };
  });
  const addCustom = () => {
    const value = customTag.trim();
    if (!value) return;
    setState((current) => ({ ...current, search_keywords: unique([...current.search_keywords, value]), semantic_tags: unique([...current.semantic_tags, value]) }));
    setCustomTag("");
  };

  async function saveDiscovery() {
    setSaving(true); setMessage("");
    try {
      const payload = {
        vibe_tags: unique(state.vibe_tags),
        best_for_tags: unique(state.best_for_tags),
        best_for: unique(state.best_for_tags),
        date_style_tags: unique(state.date_style_tags),
        special_features: unique(state.special_features),
        search_keywords: unique(state.search_keywords),
        semantic_tags: semanticPreview,
      };
      const response = await fetch("/api/locations/edit-context", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: locationType, id: canonicalId || locationId, payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Discovery details could not be saved.");
      setMessage("Discovery details saved. These signals can now support search and matching.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Discovery details could not be saved.");
    } finally { setSaving(false); }
  }

  async function suggestTags() {
    setAiBusy(true); setMessage(""); setAiSuggestions([]);
    try {
      const response = await fetch("/api/locations/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "discovery_tags",
          id: canonicalId || locationId,
          location_id: canonicalId || locationId,
          type: "locations",
          demo: demoMode,
          name: "",
          vibe_tags: state.vibe_tags,
          best_for_tags: state.best_for_tags,
          date_style_tags: state.date_style_tags,
          special_features: state.special_features,
          search_keywords: state.search_keywords,
          semantic_tags: semanticPreview,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.ai_access) setAiAccess(result.ai_access);
        throw new Error(result.error || "AI suggestions are unavailable right now.");
      }
      const suggestions = unique([
        ...normalize(result.suggestions?.vibe_tags),
        ...normalize(result.suggestions?.best_for_tags),
        ...normalize(result.suggestions?.date_style_tags),
        ...normalize(result.suggestions?.special_features),
        ...normalize(result.suggestions?.search_keywords),
        ...normalize(result.suggestions?.semantic_tags),
      ]);
      setAiSuggestions(suggestions);
      setAiAccess(result.ai_access || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI suggestions are unavailable right now.");
    } finally { setAiBusy(false); }
  }

  function applyAiSuggestion(tag: string) {
    setState((current) => ({ ...current, semantic_tags: unique([...current.semantic_tags, tag]), search_keywords: unique([...current.search_keywords, tag]) }));
    setAiSuggestions((current) => current.filter((item) => item !== tag));
  }

  if (loading) return <section className="mx-auto max-w-6xl px-4 pb-8 sm:px-6 lg:px-8"><div className="h-56 animate-pulse rounded-3xl border border-white/10 bg-white/[0.04]" /></section>;

  return (
    <section className="mx-auto max-w-6xl px-4 pb-10 text-white sm:px-6 lg:px-8">
      <div className="rounded-[32px] border border-white/10 bg-gradient-to-br from-[#111722] to-[#090c12] p-5 sm:p-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-[#ff6b86]"><Search size={18} /><span className="text-xs font-black uppercase tracking-[0.18em]">Help customers discover you</span></div>
            <h2 className="mt-3 text-2xl font-black">Describe the experience, not the database.</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-white/50">Choose the words guests would naturally use when searching. TheOutHaven stores them in the structured discovery fields and also builds the broader semantic tags used by search.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={suggestTags} disabled={aiBusy || aiAccess?.upgrade_required} className="inline-flex items-center gap-2 rounded-2xl border border-[#ff6b86]/30 bg-[#e1062a]/15 px-4 py-2.5 text-sm font-black disabled:opacity-45"><WandSparkles size={16} />{aiBusy ? "Finding tags..." : "Suggest tags for me"}</button>
            <button type="button" onClick={saveDiscovery} disabled={saving} className="rounded-2xl bg-white px-4 py-2.5 text-sm font-black text-black disabled:opacity-45">{saving ? "Saving..." : "Save discovery details"}</button>
          </div>
        </div>

        {aiAccess ? <div className={`mt-5 rounded-2xl border p-4 text-sm font-bold ${aiAccess.paid ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-100" : "border-amber-300/20 bg-amber-400/10 text-amber-100"}`}>
          {aiAccess.paid ? "Paid plan: full AI discovery suggestions are unlocked." : aiAccess.upgrade_required ? <>You used all 3 free AI tag suggestions. <Link href="/locations/dashboard/billing" className="underline">Upgrade your account</Link> to unlock ongoing AI recommendations.</> : <>Free plan: {aiAccess.remaining ?? 0} of 3 AI suggestions remaining. Manual discovery tags stay available.</>}
        </div> : null}
        {message ? <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.05] p-4 text-sm font-bold text-white/70">{message}</div> : null}

        {aiSuggestions.length ? <div className="mt-5 rounded-3xl border border-[#ff6b86]/20 bg-[#e1062a]/10 p-5"><div className="flex items-center gap-2"><Sparkles size={17} className="text-[#ff6b86]" /><h3 className="font-black">AI suggestions</h3></div><p className="mt-1 text-sm text-white/45">Tap only the suggestions that accurately describe your location.</p><div className="mt-3 flex flex-wrap gap-2">{aiSuggestions.map((tag) => <button key={tag} type="button" onClick={() => applyAiSuggestion(tag)} className="rounded-full border border-white/15 bg-black/25 px-3 py-2 text-sm font-bold text-white/80 hover:border-[#ff6b86]/50">+ {tag}</button>)}</div></div> : null}

        <div className="mt-6 grid gap-5 xl:grid-cols-2">
          <TagGroup title="Vibe & atmosphere" description="How does the place feel?" options={VIBES} selected={state.vibe_tags} onToggle={(value) => toggle("vibe_tags", value)} />
          <TagGroup title="Great for" description="What occasions fit this location best?" options={BEST_FOR} selected={state.best_for_tags} onToggle={(value) => toggle("best_for_tags", value)} />
          <TagGroup title="Date style" description="What kind of outing does it support?" options={DATE_STYLES} selected={state.date_style_tags} onToggle={(value) => toggle("date_style_tags", value)} />
          <TagGroup title="Experience & features" description="What can guests expect to find?" options={FEATURES} selected={state.special_features} onToggle={(value) => toggle("special_features", value)} />
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5">
          <div className="flex items-center gap-2"><Tags size={17} className="text-[#ff6b86]" /><h3 className="font-black">Describe your place</h3></div>
          <p className="mt-1 text-sm text-white/45">Add phrases that make your location distinctive, such as “dim lighting,” “Afrobeats on Fridays,” “quiet weekday dates,” or “pottery date night.”</p>
          <div className="mt-4 flex gap-2"><input value={customTag} onChange={(event) => setCustomTag(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addCustom(); } }} placeholder="Type a phrase and press Enter" className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-sm font-semibold outline-none focus:border-[#ff2142]/60" /><button type="button" onClick={addCustom} className="rounded-2xl border border-white/10 px-4 py-3 text-sm font-black">Add</button></div>
          <div className="mt-3 flex flex-wrap gap-2">{state.search_keywords.map((tag) => <button key={tag} type="button" onClick={() => toggle("search_keywords", tag)} className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-bold text-white/70">{tag} ×</button>)}</div>
        </div>

        <div className="mt-5 rounded-3xl border border-white/10 bg-black/20 p-5"><p className="text-xs font-black uppercase tracking-[0.16em] text-white/35">Semantic search preview</p><p className="mt-2 text-sm text-white/45">These combined signals are what TheOutHaven can use for matching and natural-language discovery.</p><div className="mt-3 flex flex-wrap gap-2">{semanticPreview.length ? semanticPreview.map((tag) => <span key={tag} className="rounded-full bg-white/[0.06] px-3 py-1.5 text-xs font-bold text-white/65">{tag}</span>) : <span className="text-sm text-white/30">Choose a few tags above to build the semantic profile.</span>}</div></div>
      </div>
    </section>
  );
}

function TagGroup({ title, description, options, selected, onToggle }: { title: string; description: string; options: string[]; selected: string[]; onToggle: (value: string) => void }) {
  return <div className="rounded-3xl border border-white/10 bg-black/20 p-5"><h3 className="font-black">{title}</h3><p className="mt-1 text-sm text-white/40">{description}</p><div className="mt-4 flex flex-wrap gap-2">{options.map((option) => { const active = selected.some((item) => item.toLowerCase() === option.toLowerCase()); return <button key={option} type="button" onClick={() => onToggle(option)} className={`rounded-full border px-3 py-2 text-sm font-bold transition ${active ? "border-[#ff2142]/60 bg-[#e1062a]/20 text-white" : "border-white/10 bg-white/[0.035] text-white/55 hover:bg-white/[0.07]"}`}>{active ? "✓ " : "+ "}{option}</button>; })}</div></div>;
}
