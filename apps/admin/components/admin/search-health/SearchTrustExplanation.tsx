"use client";

type SearchTrustRow = {
  raw_query?: string | null;
  intent_parser_source?: string | null;
  llm_ms?: number | null;
  metadata?: Record<string, any> | null;
  restaurant_count?: number | null;
  activity_count?: number | null;
  pair_count?: number | null;
  no_results_reason?: string | null;
  no_pairs_reason?: string | null;
};

function first<T>(...values: T[]): T | null {
  for (const value of values) if (value !== undefined && value !== null && value !== "") return value;
  return null;
}

function list(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean).slice(0, 8);
}

function boolLabel(value: unknown) {
  return value === true ? "Yes" : value === false ? "No" : "Unknown";
}

export default function SearchTrustExplanation({ row }: { row: SearchTrustRow }) {
  const metadata = row.metadata ?? {};
  const debug = (metadata.debug ?? metadata.searchDebug ?? metadata.search_debug ?? metadata.normalizedIntent?.debug ?? {}) as Record<string, any>;
  const normalized = (metadata.normalizedIntent ?? metadata.normalized_intent ?? debug.normalizedIntent ?? debug.parsedIntent ?? {}) as Record<string, any>;
  const trust = (debug.trust ?? metadata.trust ?? {}) as Record<string, any>;
  const nlp = (debug.nlp ?? metadata.nlp ?? {}) as Record<string, any>;
  const pairing = (debug.pairingPreference ?? debug.pairing_preference ?? normalized.pairingPreference ?? normalized.pairing_preference ?? {}) as Record<string, any>;
  const searchTerms = (debug.searchTerms ?? metadata.searchTerms ?? {}) as Record<string, any>;
  const restaurant = (normalized.restaurantIntent ?? normalized.restaurant_intent ?? searchTerms.restaurant ?? {}) as Record<string, any>;
  const activity = (normalized.activityIntent ?? normalized.activity_intent ?? searchTerms.activity ?? {}) as Record<string, any>;
  const rejectionReasons = (debug.rejectionReasons ?? metadata.rejectionReasons ?? {}) as Record<string, unknown>;
  const rejections = Object.entries(rejectionReasons).filter(([, count]) => Number(count) > 0).slice(0, 8);
  const llmUsed = first(trust.llmUsed, nlp.llmUsed, Number(row.llm_ms ?? 0) > 0);
  const personalizationMode = String(first(trust.personalizationMode, debug.personalization?.mode, metadata.personalizationMode, "unknown"));
  const consentReason = String(first(trust.personalizationConsentReason, metadata.personalizationConsentReason, "unknown"));
  const sponsoredCount = Number(first(trust.sponsoredResultCount, metadata.sponsoredResultCount, 0) ?? 0);
  const fallback = first(debug.fallbackMode, metadata.v2_fallback_outcome, metadata.fallbackOutcome, null);
  const cuisines = list(restaurant.cuisineTerms ?? restaurant.cuisine_terms);
  const activities = list(activity.activityTerms ?? activity.activity_terms);
  const features = [...list(restaurant.featureTerms ?? restaurant.feature_terms), ...list(activity.featureTerms ?? activity.feature_terms)].slice(0, 8);

  return (
    <details className="rounded-xl border border-white/10 bg-black/20 p-2 text-xs">
      <summary className="cursor-pointer font-black text-rose-200">Explain search</summary>
      <div className="mt-3 space-y-3 text-white/60">
        <div className="grid gap-2 sm:grid-cols-2">
          <Metric label="Parser" value={String(first(row.intent_parser_source, debug.intentParserSource, "unknown"))} />
          <Metric label="LLM used" value={boolLabel(llmUsed)} />
          <Metric label="Personalization" value={personalizationMode} />
          <Metric label="Consent" value={consentReason.replaceAll("_", " ")} />
          <Metric label="Sponsored results" value={String(sponsoredCount)} />
          <Metric label="Fallback" value={fallback ? String(fallback) : "None recorded"} />
          <Metric label="Walking required" value={boolLabel(first(pairing.requireWalkablePair, pairing.require_walkable_pair, false))} />
          <Metric label="Max walk" value={pairing.maxPairWalkingMinutes ? `${pairing.maxPairWalkingMinutes} min` : "Not set"} />
        </div>
        {(cuisines.length || activities.length || features.length) ? <div>
          <p className="font-black text-white/80">Interpreted request</p>
          {cuisines.length ? <p className="mt-1">Cuisine: {cuisines.join(", ")}</p> : null}
          {activities.length ? <p className="mt-1">Activity: {activities.join(", ")}</p> : null}
          {features.length ? <p className="mt-1">Features: {features.join(", ")}</p> : null}
        </div> : null}
        <div>
          <p className="font-black text-white/80">Outcome</p>
          <p className="mt-1">Restaurants {row.restaurant_count ?? 0} · Activities {row.activity_count ?? 0} · Pairs {row.pair_count ?? 0}</p>
          {row.no_results_reason ? <p className="mt-1 text-amber-200">No results: {row.no_results_reason}</p> : null}
          {row.no_pairs_reason ? <p className="mt-1 text-amber-200">No pairs: {row.no_pairs_reason}</p> : null}
        </div>
        {rejections.length ? <div><p className="font-black text-white/80">Rejections</p>{rejections.map(([reason, count]) => <p className="mt-1" key={reason}>{reason.replaceAll("_", " ")}: {String(count)}</p>)}</div> : null}
      </div>
    </details>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-white/[0.04] p-2"><p className="text-[9px] font-black uppercase tracking-wide text-white/30">{label}</p><p className="mt-1 font-bold text-white/75">{value}</p></div>;
}
