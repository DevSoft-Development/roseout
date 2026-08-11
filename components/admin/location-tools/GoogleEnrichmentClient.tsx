"use client";

import { useMemo, useState } from "react";

type AdminApiResult = {
  success?: boolean;
  error?: string;
  applied?: number;
  approved?: number;
  rejected?: number;
  failed?: number;
  [key: string]: unknown;
};

type Suggestion = {
  id: string;
  source_table: string;
  source_id: string;
  location_name: string | null;
  local_address?: string | null;
  google_display_name: string | null;
  match_confidence: number | null;
  suggested_search_keywords: string[] | null;
  suggested_semantic_tags: string[] | null;
  suggested_intent_tags: string[] | null;
  suggested_food_terms: string[] | null;
  suggested_category_terms: string[] | null;
  suggested_feature_terms: string[] | null;
  evidence: Record<string, unknown> | null;
  status: string | null;
  created_at: string | null;
};

type ReviewReason = "all" | "weak_name" | "distance" | "address_uncertain" | "address_conflict";

async function parseJsonResponse(response: Response): Promise<AdminApiResult> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: text || "Request failed." };
  }
}

function asNumber(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function asBoolean(value: unknown) {
  return value === true;
}

function reviewFlags(suggestion: Suggestion) {
  const evidence = suggestion.evidence || {};
  const similarity = asNumber(evidence.nameSimilarity);
  const distance = asNumber(evidence.distanceMeters);
  const addressMatch = asBoolean(evidence.addressMatch);
  const addressConflict = asBoolean(evidence.addressConflict);

  return {
    similarity,
    distance,
    addressMatch,
    addressConflict,
    weakName: similarity !== null && similarity < 0.85,
    far: distance !== null && distance > 50,
    addressUncertain: !addressMatch,
  };
}

function reasonLabel(suggestion: Suggestion) {
  const flags = reviewFlags(suggestion);
  const reasons: string[] = [];
  if (flags.addressConflict) reasons.push("Address conflict");
  if (flags.weakName) reasons.push("Weak name match");
  if (flags.far) reasons.push("Distance mismatch");
  if (flags.addressUncertain && !flags.addressConflict) reasons.push("Address needs confirmation");
  return reasons.length ? reasons.join(" · ") : "Manual identity review";
}

function resultMessage(action: "approve" | "reject", result: AdminApiResult | null) {
  if (!result) return null;
  if (result.error) return result.error;
  const count = action === "approve"
    ? Number(result.applied ?? result.approved ?? 0)
    : Number(result.rejected ?? 0);
  return action === "approve"
    ? `${count || "Selected"} suggestion${count === 1 ? "" : "s"} approved and queued for canonical refresh.`
    : `${count || "Selected"} suggestion${count === 1 ? "" : "s"} rejected.`;
}

export function GoogleEnrichmentClient({ initialSuggestions }: { initialSuggestions: Suggestion[] }) {
  const [sourceTable, setSourceTable] = useState("locations");
  const [reason, setReason] = useState<ReviewReason>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<AdminApiResult | null>(null);
  const [lastAction, setLastAction] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const visible = useMemo(() => initialSuggestions.filter((suggestion) => {
    if (sourceTable !== "all" && suggestion.source_table !== sourceTable) return false;
    const flags = reviewFlags(suggestion);
    if (reason === "weak_name") return flags.weakName;
    if (reason === "distance") return flags.far;
    if (reason === "address_uncertain") return flags.addressUncertain && !flags.addressConflict;
    if (reason === "address_conflict") return flags.addressConflict;
    return true;
  }), [initialSuggestions, sourceTable, reason]);

  const selectedVisibleCount = visible.filter((suggestion) => selected.has(suggestion.id)).length;
  const allVisibleSelected = visible.length > 0 && selectedVisibleCount === visible.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visible.forEach((suggestion) => next.delete(suggestion.id));
      else visible.forEach((suggestion) => next.add(suggestion.id));
      return next;
    });
  }

  async function apply(action: "approve" | "reject") {
    setLoading(true);
    setResult(null);
    setLastAction(action);
    setError(null);
    try {
      const response = await fetch("/api/admin/locations/google-food-suggestions/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestionIds: Array.from(selected), action }),
      });
      const json = await parseJsonResponse(response);
      setResult(json);
      if (!response.ok || json.success === false) {
        setError(String(json.error || "Google suggestion review action failed."));
      } else {
        setSelected(new Set());
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[1.5rem] border border-amber-300/20 bg-amber-500/10 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-amber-200">Manual Google Review</p>
            <p className="mt-1 text-sm font-bold text-white/70">
              {initialSuggestions.length} unresolved suggestion{initialSuggestions.length === 1 ? "" : "s"}. Compare identity signals before approving. These review actions use stored evidence only and do not call Google.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || selected.size === 0}
              onClick={() => apply("approve")}
              className="rounded-full bg-white px-5 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
            >
              Approve Selected ({selected.size})
            </button>
            <button
              type="button"
              disabled={loading || selected.size === 0}
              onClick={() => apply("reject")}
              className="rounded-full bg-red-600 px-5 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Reject Selected ({selected.size})
            </button>
          </div>
        </div>
      </div>

      <section className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="text-sm font-bold text-white/70">
            Source
            <select value={sourceTable} onChange={(event) => setSourceTable(event.target.value)} className="mt-2 w-full rounded-xl bg-black/50 p-3 text-white">
              <option value="locations">Locations</option>
              <option value="restaurants">Restaurants</option>
              <option value="activities">Activities</option>
              <option value="all">All sources</option>
            </select>
          </label>
          <label className="text-sm font-bold text-white/70">
            Review reason
            <select value={reason} onChange={(event) => setReason(event.target.value as ReviewReason)} className="mt-2 w-full rounded-xl bg-black/50 p-3 text-white">
              <option value="all">All unresolved</option>
              <option value="weak_name">Weak name match</option>
              <option value="distance">Distance mismatch</option>
              <option value="address_uncertain">Address needs confirmation</option>
              <option value="address_conflict">Address conflict</option>
            </select>
          </label>
          <div className="flex flex-col justify-end">
            <button
              type="button"
              disabled={visible.length === 0}
              onClick={toggleVisible}
              className="rounded-xl border border-white/15 bg-white/10 p-3 text-sm font-black text-white disabled:opacity-40"
            >
              {allVisibleSelected ? "Clear visible selection" : `Select visible (${visible.length})`}
            </button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-white/50">
          <span className="rounded-full bg-white/10 px-3 py-1">Showing {visible.length}</span>
          <span className="rounded-full bg-white/10 px-3 py-1">Selected {selected.size}</span>
          <span className="rounded-full bg-white/10 px-3 py-1">No Google API calls</span>
        </div>
        {error ? <div className="mt-4 rounded-2xl border border-red-300/30 bg-red-500/15 p-4 text-sm font-bold text-red-100">{error}</div> : null}
        {!error && result && lastAction ? (
          <div className="mt-4 rounded-2xl border border-emerald-300/25 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">
            {resultMessage(lastAction, result)}
          </div>
        ) : null}
      </section>

      <section className="space-y-4">
        {visible.length === 0 ? (
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-8 text-center text-sm font-bold text-white/50">
            No unresolved suggestions match this filter.
          </div>
        ) : visible.map((suggestion) => {
          const evidence = suggestion.evidence || {};
          const flags = reviewFlags(suggestion);
          const googleAddress = String(evidence.googleFormattedAddress || "No Google address captured");
          const confidence = Math.round(Number(suggestion.match_confidence ?? 0));
          const similarityPercent = flags.similarity === null ? null : Math.round(flags.similarity * 100);

          return (
            <article key={suggestion.id} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <label className="flex items-center gap-3 text-sm font-bold text-white/70">
                  <input type="checkbox" checked={selected.has(suggestion.id)} onChange={() => toggle(suggestion.id)} />
                  Select
                </label>
                <span className="rounded-full bg-amber-500/15 px-3 py-1 text-xs font-black uppercase tracking-widest text-amber-100">
                  {reasonLabel(suggestion)}
                </span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <IdentityCard label="Your catalog" name={suggestion.location_name || "Unnamed location"} address={suggestion.local_address || "Local address unavailable"} />
                <IdentityCard label="Google evidence" name={suggestion.google_display_name || "No Google display name"} address={googleAddress} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Signal label="Match confidence" value={`${confidence}%`} risk={confidence < 90} />
                <Signal label="Name similarity" value={similarityPercent === null ? "Unknown" : `${similarityPercent}%`} risk={flags.weakName} />
                <Signal label="Distance" value={flags.distance === null ? "Unknown" : `${Math.round(flags.distance)} m`} risk={flags.far} />
                <Signal label="Address" value={flags.addressConflict ? "Conflict" : flags.addressMatch ? "Matches" : "Confirm manually"} risk={flags.addressConflict || flags.addressUncertain} />
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <TermList title="Suggested terms" terms={[...(suggestion.suggested_food_terms || []), ...(suggestion.suggested_category_terms || []), ...(suggestion.suggested_feature_terms || [])]} />
                <TermList title="Search metadata" terms={[...(suggestion.suggested_search_keywords || []), ...(suggestion.suggested_semantic_tags || []), ...(suggestion.suggested_intent_tags || [])]} />
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

function IdentityCard({ label, name, address }: { label: string; name: string; address: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <p className="text-xs font-black uppercase tracking-widest text-white/40">{label}</p>
      <h2 className="mt-2 text-lg font-black text-white">{name}</h2>
      <p className="mt-2 text-sm font-semibold leading-5 text-white/55">{address}</p>
    </div>
  );
}

function Signal({ label, value, risk }: { label: string; value: string; risk?: boolean }) {
  return (
    <div className={`rounded-2xl border p-4 ${risk ? "border-amber-300/20 bg-amber-500/10" : "border-emerald-300/15 bg-emerald-500/5"}`}>
      <p className="text-xs font-black uppercase tracking-widest text-white/40">{label}</p>
      <p className={`mt-2 text-base font-black ${risk ? "text-amber-100" : "text-emerald-100"}`}>{value}</p>
    </div>
  );
}

function TermList({ title, terms }: { title: string; terms: string[] }) {
  const uniqueTerms = Array.from(new Set(terms.filter(Boolean)));
  return (
    <div>
      <p className="text-xs font-black uppercase tracking-widest text-white/40">{title}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {uniqueTerms.length ? uniqueTerms.map((term) => <span key={term} className="rounded-full bg-white/10 px-3 py-1 text-xs text-white/70">{term}</span>) : <span className="text-sm text-white/35">None</span>}
      </div>
    </div>
  );
}
