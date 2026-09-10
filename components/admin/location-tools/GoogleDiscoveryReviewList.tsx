"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deriveLocationQualityState, LOCATION_QUALITY_STATE_LABELS, type CanonicalLocationQualityState } from "@/lib/location-quality-state";

type Candidate = {
  id: string;
  name?: string | null;
  location_type?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  phone?: string | null;
  website?: string | null;
  primary_category?: string | null;
  cuisine?: string | null;
  activity_type?: string | null;
  rating?: number | string | null;
  review_count?: number | null;
  quality_score?: number | string | null;
  quality_status?: string | null;
  import_status?: string | null;
  duplicate_status?: string | null;
  rejection_reason?: string | null;
  main_image?: string | null;
  source_url?: string | null;
  has_photos?: boolean | null;
  photo_status?: string | null;
  import_confidence?: string | null;
  source_quality_status?: string | null;
  public_visibility_tier?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  raw_payload?: Record<string, unknown> | null;
};

type ReviewAction = "approve_publish" | "keep_hidden" | "reject" | "re_evaluate";

const REASON_LABELS: Record<string, string> = {
  curated_manual_review: "Manual review",
  category_evidence_missing: "Category evidence missing",
  needs_website: "Needs website",
  needs_hours: "Needs hours",
  weak_outing_evidence: "Weak outing evidence",
  subjective_hidden_gem_requires_review: "Hidden-gem judgment",
  quick_service_search_only: "Quick-bite/search-only",
};

const COMMON_CATEGORIES = [
  "restaurant", "bar", "lounge", "rooftop", "nightclub", "hookah_lounge", "jazz_live_music",
  "arcade", "bowling", "karaoke", "escape_room", "mini_golf", "axe_throwing", "museum", "art_gallery",
  "comedy", "cinema", "spa", "billiards", "aerial_class", "immersive", "park", "theater",
  "italian", "japanese", "sushi", "korean", "thai", "chinese", "indian", "mexican", "latin", "caribbean",
  "seafood", "steakhouse", "bbq", "soul_food", "brunch", "cafe", "dessert", "vegan", "vegetarian", "halal", "kosher",
];

function num(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function reasonTokens(candidate: Candidate) {
  return String(candidate.rejection_reason || "curated_manual_review")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function humanize(value: string) {
  return REASON_LABELS[value] || value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function tone(state: CanonicalLocationQualityState) {
  if (state === "ready") return "border-emerald-400/20 bg-emerald-500/[0.07]";
  if (state === "hidden") return "border-white/10 bg-white/[0.04]";
  if (state === "rejected" || state === "duplicate_review") return "border-red-400/15 bg-red-500/[0.05]";
  return "border-amber-300/15 bg-amber-400/[0.06]";
}

function Detail({ title, value }: { title: string; value: unknown }) {
  const display = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">{title}</div>
      <div className="mt-1 break-words text-sm font-bold text-white/80">{display}</div>
    </div>
  );
}

export function GoogleDiscoveryReviewList({ candidates }: { candidates: Candidate[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [reasonFilter, setReasonFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [categoryDraft, setCategoryDraft] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const reviewCandidates = useMemo(() => candidates.filter((candidate) => candidate.import_status === "staged" && candidate.quality_status === "review"), [candidates]);
  const reasons = useMemo(() => Array.from(new Set(reviewCandidates.flatMap(reasonTokens))).sort(), [reviewCandidates]);
  const categorySuggestions = useMemo(() => Array.from(new Set([...COMMON_CATEGORIES, ...reviewCandidates.map((candidate) => candidate.primary_category || "").filter(Boolean)])).sort(), [reviewCandidates]);
  const filtered = useMemo(() => reviewCandidates.filter((candidate) => {
    if (reasonFilter !== "all" && !reasonTokens(candidate).includes(reasonFilter)) return false;
    if (typeFilter !== "all" && candidate.location_type !== typeFilter) return false;
    if (query.trim()) {
      const haystack = [candidate.name, candidate.city, candidate.state, candidate.primary_category, candidate.website].filter(Boolean).join(" ").toLowerCase();
      if (!haystack.includes(query.trim().toLowerCase())) return false;
    }
    return true;
  }), [reviewCandidates, reasonFilter, typeFilter, query]);

  const callAction = (ids: string[], action: ReviewAction, extra?: Record<string, unknown>) => {
    startTransition(async () => {
      setMessage(`${action === "approve_publish" ? "Publishing" : "Updating"} ${ids.length} selected candidate${ids.length === 1 ? "" : "s"}…`);
      try {
        const response = await fetch("/api/admin/location-growth/google-discovery-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, action, ...extra }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success !== true) throw new Error(body?.error || "Review action failed.");
        setMessage(action === "approve_publish" ? `Approved and published ${body.published ?? ids.length} candidate(s).` : `Updated ${body.updated ?? ids.length} candidate(s).`);
        setSelected(new Set());
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Review action failed.");
      }
    });
  };

  const correctCategory = (candidate: Candidate) => {
    const category = (categoryDraft[candidate.id] || candidate.primary_category || "").trim();
    startTransition(async () => {
      setMessage(`Re-evaluating ${candidate.name || "candidate"} as ${category}…`);
      try {
        const response = await fetch("/api/admin/location-growth/google-discovery-review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: candidate.id, action: "correct_category", category }),
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || body?.success !== true) throw new Error(body?.error || "Category correction failed.");
        setMessage(`Category saved. Current evaluator decision: ${String(body.decision || "review").replace(/_/g, " ")}.`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Category correction failed.");
      }
    });
  };

  const visibleSelected = filtered.filter((candidate) => selected.has(candidate.id)).length;
  const toggleAll = () => {
    if (visibleSelected === filtered.length && filtered.length) setSelected(new Set([...selected].filter((id) => !filtered.some((candidate) => candidate.id === id))));
    else setSelected(new Set([...selected, ...filtered.map((candidate) => candidate.id)]));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, city, category…" className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-bold text-white outline-none placeholder:text-white/30" />
          <select value={reasonFilter} onChange={(event) => setReasonFilter(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-bold text-white">
            <option value="all">All review reasons</option>
            {reasons.map((reason) => <option key={reason} value={reason}>{humanize(reason)}</option>)}
          </select>
          <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className="rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-bold text-white">
            <option value="all">Restaurants + activities</option>
            <option value="restaurant">Restaurants</option>
            <option value="activity">Activities</option>
          </select>
          <button type="button" onClick={toggleAll} className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm font-black text-white">{visibleSelected === filtered.length && filtered.length ? "Clear visible" : "Select visible"}</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-black uppercase tracking-wider text-white/45">{filtered.length} shown · {selected.size} selected</span>
          {selected.size ? (
            <>
              <button disabled={isPending} onClick={() => callAction([...selected], "approve_publish")} className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-black disabled:opacity-50">Approve & publish</button>
              <button disabled={isPending} onClick={() => callAction([...selected], "re_evaluate")} className="rounded-lg border border-sky-300/20 bg-sky-400/[0.08] px-3 py-2 text-xs font-black text-sky-100 disabled:opacity-50">Re-evaluate</button>
              <button disabled={isPending} onClick={() => callAction([...selected], "keep_hidden")} className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-xs font-black text-white disabled:opacity-50">Keep hidden</button>
              <button disabled={isPending} onClick={() => callAction([...selected], "reject")} className="rounded-lg border border-red-300/20 bg-red-500/[0.08] px-3 py-2 text-xs font-black text-red-100 disabled:opacity-50">Reject</button>
            </>
          ) : null}
        </div>
        {message ? <p className="mt-3 text-sm font-bold text-white/65">{message}</p> : null}
      </div>

      <datalist id="google-review-categories">
        {categorySuggestions.map((category) => <option key={category} value={category} />)}
      </datalist>

      {filtered.map((candidate) => {
        const expanded = openId === candidate.id;
        const google = candidate.raw_payload && typeof candidate.raw_payload === "object" ? ((candidate.raw_payload as Record<string, unknown>).google as Record<string, unknown> | undefined) : undefined;
        const gap = candidate.raw_payload && typeof candidate.raw_payload === "object" ? ((candidate.raw_payload as Record<string, unknown>).gap as Record<string, unknown> | undefined) : undefined;
        const qualityState = deriveLocationQualityState(candidate);
        const tokens = reasonTokens(candidate);
        const googleTypes = Array.isArray(google?.types) ? google?.types.join(", ") : "—";
        const hours = google?.regularOpeningHours || google?.current_opening_hours || google?.opening_hours;
        const selectedNow = selected.has(candidate.id);

        return (
          <article key={candidate.id} className={`overflow-hidden rounded-2xl border ${tone(qualityState)}`}>
            <div className="flex items-start gap-3 p-4">
              <input type="checkbox" checked={selectedNow} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(candidate.id)) next.delete(candidate.id); else next.add(candidate.id); return next; })} className="mt-1 h-4 w-4" aria-label={`Select ${candidate.name || "candidate"}`} />
              <button type="button" onClick={() => setOpenId(expanded ? null : candidate.id)} className="min-w-0 flex-1 text-left" aria-expanded={expanded}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-black text-white">{candidate.name || "Unnamed Google candidate"}</h3>
                      <span className="rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] font-black uppercase tracking-wider text-white/70">{LOCATION_QUALITY_STATE_LABELS[qualityState]}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold text-white/50">{[candidate.city, candidate.state, candidate.primary_category].filter(Boolean).join(" · ")}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">{tokens.map((reason) => <span key={reason} className="rounded-full border border-amber-300/15 bg-amber-400/[0.07] px-2 py-1 text-[11px] font-black text-amber-100/80">{humanize(reason)}</span>)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-black text-white/65">
                    <span className="rounded-full bg-black/25 px-3 py-1.5">★ {num(candidate.rating).toFixed(1)}</span>
                    <span className="rounded-full bg-black/25 px-3 py-1.5">{num(candidate.review_count).toLocaleString()} reviews</span>
                    <span className="rounded-full bg-black/25 px-3 py-1.5">Score {num(candidate.quality_score)}</span>
                    <span className="rounded-full border border-white/10 px-3 py-1.5 text-white/45">{expanded ? "Hide" : "Review"}</span>
                  </div>
                </div>
              </button>
            </div>

            {expanded ? (
              <div className="border-t border-white/10 bg-black/15 p-4">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <Detail title="Address" value={[candidate.address, candidate.city, candidate.state, candidate.zip_code].filter(Boolean).join(", ")} />
                  <Detail title="Website" value={candidate.website} />
                  <Detail title="Hours evidence" value={hours ? "Present in stored Google evidence" : "Missing"} />
                  <Detail title="Photo" value={candidate.photo_status || (candidate.has_photos ? "has photo" : "missing photo")} />
                  <Detail title="Google primary type" value={google?.primaryType} />
                  <Detail title="Google types" value={googleTypes} />
                  <Detail title="Discovery query" value={(candidate.raw_payload as Record<string, unknown> | null)?.query} />
                  <Detail title="Discovery category" value={gap?.category || candidate.primary_category} />
                  <Detail title="Duplicate state" value={candidate.duplicate_status} />
                  <Detail title="Business status" value={google?.business_status || google?.businessStatus} />
                  <Detail title="Phone" value={candidate.phone} />
                  <Detail title="Coordinates" value={candidate.latitude != null && candidate.longitude != null ? `${candidate.latitude}, ${candidate.longitude}` : null} />
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Correct category + re-evaluate</div>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input list="google-review-categories" value={categoryDraft[candidate.id] ?? candidate.primary_category ?? ""} onChange={(event) => setCategoryDraft((current) => ({ ...current, [candidate.id]: event.target.value }))} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2.5 text-sm font-bold text-white outline-none" />
                    <button disabled={isPending} onClick={() => correctCategory(candidate)} className="rounded-xl border border-sky-300/20 bg-sky-400/[0.08] px-4 py-2.5 text-sm font-black text-sky-100 disabled:opacity-50">Save category & re-evaluate</button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {candidate.source_url ? <a href={candidate.source_url} target="_blank" rel="noreferrer" className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-black text-white">Open Google source</a> : null}
                  <button disabled={isPending} onClick={() => callAction([candidate.id], "approve_publish")} className="rounded-xl bg-emerald-400 px-4 py-2.5 text-sm font-black text-black disabled:opacity-50">Approve & publish</button>
                  <button disabled={isPending} onClick={() => callAction([candidate.id], "re_evaluate")} className="rounded-xl border border-sky-300/20 bg-sky-400/[0.08] px-4 py-2.5 text-sm font-black text-sky-100 disabled:opacity-50">Re-evaluate</button>
                  <button disabled={isPending} onClick={() => callAction([candidate.id], "keep_hidden")} className="rounded-xl border border-white/15 bg-black/30 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">Keep hidden</button>
                  <button disabled={isPending} onClick={() => callAction([candidate.id], "reject")} className="rounded-xl border border-red-300/20 bg-red-500/[0.08] px-4 py-2.5 text-sm font-black text-red-100 disabled:opacity-50">Reject</button>
                </div>
              </div>
            ) : null}
          </article>
        );
      })}

      {!filtered.length ? <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm font-bold text-white/45">No review candidates match these filters.</div> : null}
    </div>
  );
}
