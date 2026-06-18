"use client";

import { useState } from "react";

const examples = [
  "steak dinner with bowling in Astoria",
  "group dinner and drinks",
  "casual dinner and relaxed activity",
  "restaurant with activity walking distance",
  "steak dinner and hookah lounge after",
];

type SearchLabResult = Record<string, unknown>;

type SearchLabBatchResult = {
  query: string;
  success: boolean;
  data?: SearchLabResult;
  error?: string;
};

function getNonEmptySearchLines(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}


function getPerformance(result: SearchLabBatchResult) {
  return (result.data?.performance as SearchLabResult | undefined) || ((result.data?.debug as SearchLabResult | undefined)?.performance as SearchLabResult | undefined) || null;
}

function getTotalMs(result: SearchLabBatchResult) {
  return Number(result.data?.total_ms || (result.data?.performance as any)?.total_ms || ((result.data?.debug as any)?.performance)?.total_ms || 0);
}

function isCriticalSpeed(result: SearchLabBatchResult) {
  const speedStatus = result.data?.speed_status || result.data?.speedStatus || (result.data?.performance as any)?.speed_status || ((result.data?.debug as any)?.performance)?.speed_status;
  return speedStatus === "critical";
}

function getOutingTimeConfidence(result: SearchLabBatchResult) {
  return ((result.data?.parsedIntent as any)?.outingTimeConfidence || ((result.data?.debug as any)?.normalizedIntent)?.outingTimeConfidence || result.data?.outingTimeConfidence || "none") as string;
}

function getBatchPerformanceSummary(results: SearchLabBatchResult[]) {
  const successfulResults = results.filter((result) => result.success);
  const totalMsValues = successfulResults.map(getTotalMs).filter((value) => value > 0);
  const averageTotalMs = totalMsValues.length > 0 ? Math.round(totalMsValues.reduce((sum, value) => sum + value, 0) / totalMsValues.length) : 0;
  const slowestResult = successfulResults.reduce<SearchLabBatchResult | null>((slowest, result) => (!slowest || getTotalMs(result) > getTotalMs(slowest) ? result : slowest), null);
  return {
    total: results.length,
    successful: successfulResults.length,
    failed: results.filter((result) => !result.success).length,
    criticalSpeedCount: successfulResults.filter(isCriticalSpeed).length,
    averageTotalMs,
    slowestQuery: slowestResult?.query || null,
    slowestTotalMs: slowestResult ? getTotalMs(slowestResult) : 0,
    overFiveSecondsCount: successfulResults.filter((result) => getTotalMs(result) > 5000).length,
    overEightSecondsCount: successfulResults.filter((result) => getTotalMs(result) > 8000).length,
    fallbackUsedCount: successfulResults.filter((result) => Boolean(result.data?.fallbackUsed)).length,
    outOfBoroughCount: successfulResults.filter((result) => Boolean((result.data?.debug as any)?.boroughStrictnessApplied && (result.data?.debug as any)?.outOfBoroughResultCount > 0)).length,
    relaxedFeatureCount: successfulResults.filter((result) => Boolean((result.data?.debug as any)?.restaurantRecoveryRelaxedFeature || (result.data?.debug as any)?.featureMissingPenaltyApplied)).length,
    explicitTimeCount: successfulResults.filter((result) => getOutingTimeConfidence(result) === "explicit").length,
    vagueTimeCount: successfulResults.filter((result) => getOutingTimeConfidence(result) === "vague").length,
    noTimeCount: successfulResults.filter((result) => getOutingTimeConfidence(result) === "none").length,
  };
}

function formatBatchResultForCopy(result: SearchLabBatchResult) {
  const status = result.success ? "Success" : "Failed";

  return [
    "TheOutHaven Search Lab Result",
    "",
    "Search:",
    result.query,
    "",
    "Status:",
    status,
    "",
    result.success ? "Parsed Output:" : "Error:",
    result.success ? safeStringify(result.data) : result.error || "Unknown error",
  ].join("\n");
}

function formatAllBatchResultsForCopy(results: SearchLabBatchResult[]) {
  const successfulCount = results.filter((result) => result.success).length;
  const failedCount = results.length - successfulCount;

  const performanceSummary = getBatchPerformanceSummary(results);

  return [
    "TheOutHaven Search Lab Batch Results",
    `Total searches: ${results.length}`,
    `Successful: ${successfulCount}`,
    `Failed: ${failedCount}`,
    `Critical speed: ${performanceSummary.criticalSpeedCount}`,
    `Average total_ms: ${performanceSummary.averageTotalMs}`,
    `Slowest query: ${performanceSummary.slowestQuery || "N/A"}`,
    `Slowest total_ms: ${performanceSummary.slowestTotalMs}`,
    `Over 5000ms: ${performanceSummary.overFiveSecondsCount}`,
    `Over 8000ms: ${performanceSummary.overEightSecondsCount}`,
    `Fallback used: ${performanceSummary.fallbackUsedCount}`,
    `Out-of-borough results: ${performanceSummary.outOfBoroughCount}`,
    `Relaxed feature matching: ${performanceSummary.relaxedFeatureCount}`,
    `Explicit time: ${performanceSummary.explicitTimeCount}`,
    `Vague time: ${performanceSummary.vagueTimeCount}`,
    `No time: ${performanceSummary.noTimeCount}`,
    "",
    results.map(formatBatchResultForCopy).join("\n\n---\n\n"),
  ].join("\n");
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  return copied;
  } catch {
    return false;
  }
}

function compactLines(lines: Array<string | null | undefined | false>) {
  return lines.filter((line) => typeof line === "string" && line.trim() && !/undefined|null$/i.test(line.trim())).join("\n");
}

function getName(item: any) { return pickFirst(item?.name, item?.restaurant_name, item?.activity_name, item?.business_name) as string | undefined; }
function getAddress(item: any) { return pickFirst(item?.address, item?.formatted_address, item?.location_address) as string | undefined; }
function getWebsite(item: any) { return pickFirst(item?.website, item?.website_url, item?.url) as string | undefined; }
function getReservation(item: any) { return pickFirst(item?.reservation_url, item?.reservation_link, item?.booking_url, item?.external_reservation_url) as string | undefined; }
function getMaps(item: any) { return pickFirst(item?.google_maps_url, item?.maps_url, item?.googleMapsUrl) as string | undefined; }
function getTags(item: any) { const tags = pickFirst(item?.tags, item?.vibe_tags, item?.best_for_tags); return Array.isArray(tags) ? tags.join(", ") : tags as string | undefined; }
function getWhy(item: any) { return pickFirst(item?.why_it_matched, item?.whyMatched, item?.match_reason, item?.reason) as string | undefined; }
function getSearchTypeLabel(item: any) { return String(pickFirst(item?.location_type, item?.type, item?.activity_name ? "activity" : item?.restaurant_name ? "restaurant" : "result") || "result"); }

function formatSearchResultForCopy(item: any, context: { query: string }) {
  const type = getSearchTypeLabel(item).toLowerCase().includes("activity") ? "Activity" : "Restaurant";
  return compactLines([
    "TheOutHaven Search Result", "",
    `Type: ${type}`,
    `Name: ${getName(item) || ""}`,
    `Category: ${pickFirst(item?.primary_category, item?.category) || ""}`,
    type === "Restaurant" ? `Cuisine: ${pickFirst(item?.cuisine, item?.cuisine_type, item?.food_type) || ""}` : `Activity Type: ${pickFirst(item?.activity_type, item?.activityType) || ""}`,
    `Address: ${getAddress(item) || ""}`,
    `City/State: ${[item?.city, item?.state].filter(Boolean).join(", ")}`,
    `Rating: ${pickFirst(item?.rating, item?.google_rating) || ""}`,
    `Price: ${pickFirst(item?.price_level, item?.price_range, item?.price) || ""}`,
    `Phone: ${pickFirst(item?.phone_number, item?.phone) || ""}`,
    `Website: ${getWebsite(item) || ""}`,
    `${type === "Restaurant" ? "Reservation URL" : "Booking/Reservation URL"}: ${getReservation(item) || ""}`,
    `Google Maps: ${getMaps(item) || ""}`,
    `Distance: ${pickFirst(item?.distance, item?.distance_miles, item?.distanceMiles) || ""}`,
    `Tags: ${getTags(item) || ""}`,
    `Why it matched: ${getWhy(item) || ""}`,
    `Search Query: ${context.query}`,
  ]);
}

function formatPairForCopy(pair: any, context: { query: string }) {
  const restaurant = pair?.restaurant || pair?.restaurantCard || pair?.venueA || {};
  const activity = pair?.activity || pair?.activityCard || pair?.venueB || {};
  return compactLines([
    "TheOutHaven Paired Outing Result", "",
    `Restaurant: ${getName(restaurant) || pair?.restaurant_name || ""}`,
    `Restaurant Address: ${getAddress(restaurant) || pair?.restaurant_address || ""}`,
    `Restaurant Category/Cuisine: ${pickFirst(restaurant?.primary_category, restaurant?.category, restaurant?.cuisine, restaurant?.cuisine_type) || ""}`,
    `Restaurant Rating: ${restaurant?.rating || ""}`,
    `Restaurant Website: ${getWebsite(restaurant) || ""}`,
    `Restaurant Reservation URL: ${getReservation(restaurant) || ""}`, "",
    `Activity: ${getName(activity) || pair?.activity_name || ""}`,
    `Activity Address: ${getAddress(activity) || pair?.activity_address || ""}`,
    `Activity Category/Type: ${pickFirst(activity?.primary_category, activity?.category, activity?.activity_type) || ""}`,
    `Activity Rating: ${activity?.rating || ""}`,
    `Activity Website: ${getWebsite(activity) || ""}`,
    `Activity Booking URL: ${getReservation(activity) || ""}`, "",
    `Pair Distance: ${pickFirst(pair?.distance, pair?.pair_distance_miles, pair?.distance_miles) || ""}`,
    `Walking Time: ${pickFirst(pair?.walking_time, pair?.walking_minutes, pair?.walkingMinutesLabel) || ""}`,
    `Why it matched: ${getWhy(pair) || ""}`,
    `Search Query: ${context.query}`,
  ]);
}

function getVisibleResults(response: SearchLabResult | null) {
  const cards = Array.isArray(response?.cards) ? response.cards as any[] : [];
  const pairs = Array.isArray(response?.pairCards) ? response.pairCards as any[] : [];
  return { cards, pairs };
}

function formatAllResultsForCopy(response: SearchLabResult, query: string) {
  const { cards, pairs } = getVisibleResults(response);
  const intent = getIntent(response);
  const market = (response.marketFiltering as any)?.resolvedMarket || (response.debugParity as any)?.resolvedMarket || "";
  const lines = cards.map((item, i) => `${i + 1}. [${getSearchTypeLabel(item)}] ${getName(item) || "Result"}\n${formatSearchResultForCopy(item, { query })}`).concat(pairs.map((pair, i) => `${cards.length + i + 1}. [Pair] ${getName(pair?.restaurant || {}) || "Restaurant"} + ${getName(pair?.activity || {}) || "Activity"}\n${formatPairForCopy(pair, { query })}`));
  return compactLines([
    "TheOutHaven Beta Search Lab Results",
    `Query: ${query}`,
    `Search Type: ${pickFirst(intent.searchType, (response.debugParity as any)?.searchType) || ""}`,
    `Market: ${market}`,
    `Generated: ${new Date().toISOString()}`, "",
    "Counts:",
    `Restaurants: ${response.restaurants || 0}`,
    `Activities: ${response.activities || 0}`,
    `Pairs: ${response.pairs || 0}`, "",
    "Results:", "",
    lines.join("\n\n"),
  ]);
}

function formatDebugJsonForCopy(response: SearchLabResult) {
  const safePayload = { debug: response.debug, debugParity: response.debugParity, parsedIntent: response.parsedIntent, performance: response.performance, marketFiltering: response.marketFiltering, rawCounts: response.rawCounts, publicCounts: response.publicCounts };
  return JSON.stringify(safePayload, null, 2);
}

function formatPromptSummaryForCopy(response: SearchLabResult, query: string) {
  const intent = getIntent(response);
  const debug = (response.debug as any) || {};
  return compactLines([
    "TheOutHaven Beta Search Lab Summary", "Prompt:", query, "", "Resolved Intent:",
    `Search Type: ${pickFirst(intent.searchType, (response.debugParity as any)?.searchType) || ""}`,
    `Primary Domain: ${pickFirst(intent.primaryDomain, intent.primary_domain) || ""}`,
    `Wants Pairing: ${pickFirst(intent.wantsPairing, (response.debugParity as any)?.wantsPairing) || ""}`,
    `Needs Restaurant: ${pickFirst(intent.needsRestaurant, (response.debugParity as any)?.needsRestaurant) || ""}`,
    `Needs Activity: ${pickFirst(intent.needsActivity, (response.debugParity as any)?.needsActivity) || ""}`,
    `Occasion: ${pickFirst(intent.occasion, intent.occasionType) || ""}`,
    `Meal/Time: ${pickFirst(intent.mealTime, intent.timeContext, response.outingTimeLabel) || ""}`,
    `Market: ${pickFirst((response.marketFiltering as any)?.resolvedMarket, (response.debugParity as any)?.resolvedMarket) || ""}`,
    `Allowed Markets: ${formatValue(pickFirst((response.marketFiltering as any)?.allowedMarkets, (response.debugParity as any)?.allowedMarkets))}`,
    `Explicit Market Requested: ${pickFirst((response.marketFiltering as any)?.explicitMarketRequested, (response.debugParity as any)?.explicitMarketRequested) || ""}`, "",
    "Counts:", `Restaurants: ${response.restaurants || 0}`, `Activities: ${response.activities || 0}`, `Pairs: ${response.pairs || 0}`, `Final Displayed: ${((response.finalResultNames as any[]) || []).length || 0}`, "",
    "Top Results:", ...(((response.finalResultNames as any[]) || []).slice(0, 5).map((name, i) => `${i + 1}. ${name}`)), "",
    "Key Debug:", `Fallback Used: ${response.fallbackUsed || false}`, `Fallback Reason: ${debug.fallbackReason || debug.noPairsReason || ""}`, `Market Guardrail Rejected: ${debug.marketGuardrailRejected || 0}`, `Parser Source: ${response.intentParserSource || response.parser_source || ""}`, `Fast Path Matched: ${response.fastPathMatched || false}`, `Performance: ${safeStringify(response.performance || {})}`,
  ]);
}

function formatValue(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "object") return safeStringify(value);
  return String(value);
}

function pickFirst(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function getIntent(result: SearchLabResult | undefined) {
  const debug = result?.debug as SearchLabResult | undefined;
  return (result?.parsedIntent as SearchLabResult | undefined) || (debug?.normalizedIntent as SearchLabResult | undefined) || (debug?.intent as SearchLabResult | undefined) || {};
}

function asSearchLabResult(value: unknown): SearchLabResult {
  return value && typeof value === "object" ? (value as SearchLabResult) : {};
}

function getGeo(intent: SearchLabResult, result: SearchLabResult | undefined): SearchLabResult {
  return asSearchLabResult(intent.geo || intent.location || result?.effectiveGeo || result?.originalGeo);
}

function SearchDebugFields({ result }: { result: SearchLabResult }) {
  const intent = getIntent(result);
  const geo = getGeo(intent, result);
  const fields = [
    ["Search type", pickFirst(intent.searchType, intent.search_type, intent.type, result.searchType)],
    ["Primary domain", pickFirst(intent.primaryDomain, intent.primary_domain, intent.domain, result.primaryDomain)],
    ["Needs restaurant", pickFirst(intent.needsRestaurant, intent.needs_restaurant, intent.restaurantRequired)],
    ["Needs activity", pickFirst(intent.needsActivity, intent.needs_activity, intent.activityRequired)],
    ["Wants pairing", pickFirst(intent.wantsPairing, intent.wants_pairing, intent.pairingRequested)],
    ["Geo raw", pickFirst(geo.raw, geo.rawQuery, intent.geoRaw, result.originalGeo)],
    ["Geo city", pickFirst(geo.city, intent.city)],
    ["Geo borough", pickFirst(geo.borough, intent.borough)],
    ["Geo neighborhood", pickFirst(geo.neighborhood, intent.neighborhood)],
    ["Geo state", pickFirst(geo.state, intent.state)],
    ["Time context", pickFirst(intent.timeContext, intent.time_context, intent.time, intent.when)],
    ["Outing date label", pickFirst(intent.outingDateLabel, result.outingDateLabel)],
    ["Outing time label", pickFirst(intent.outingTimeLabel, result.outingTimeLabel)],
    ["Outing date/time", pickFirst(intent.outingDateTimeText, result.outingDateTimeText)],
    ["Time confidence", pickFirst(intent.outingTimeConfidence, result.outingTimeConfidence)],
    ["Parsed date text", pickFirst(intent.parsedDateText, result.parsedDateText)],
    ["Parsed time text", pickFirst(intent.parsedTimeText, result.parsedTimeText)],
    ["Parsed ISO", pickFirst(intent.parsedDateTimeISO, result.parsedDateTimeISO)],
    ["Occasion", pickFirst(intent.occasion, intent.occasionType, intent.occasion_type)],
    ["Restaurant intent terms", pickFirst(intent.restaurantIntentTerms, intent.restaurant_intent_terms, result.restaurantRpcTerms, result.restaurantRpcTermsPruned)],
    ["Activity intent terms", pickFirst(intent.activityIntentTerms, intent.activity_intent_terms, result.activityRpcTerms, result.activityRpcTermsPruned)],
  ];

  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label as string} className="rounded-2xl bg-white/[.04] p-3">
          <p className="text-xs text-white/50">{label as string}</p>
          <p className="whitespace-pre-wrap break-words font-semibold text-white/85">{formatValue(value)}</p>
        </div>
      ))}
    </div>
  );
}


function PerformanceSummary({ result }: { result: SearchLabResult }) {
  const performance = (result.performance as SearchLabResult | undefined) || ((result.debug as any)?.performance as SearchLabResult | undefined) || {};
  const totalMs = Number(result.total_ms || performance.total_ms || 0);
  const speedStatus = result.speed_status || result.speedStatus || performance.speed_status;
  const debug = (result.debug as any) || {};
  const fields = [
    ["total_ms", totalMs || performance.total_ms],
    ["speed_status", speedStatus],
    ["intent_parse_ms", performance.intent_parse_ms],
    ["restaurant_rpc_ms", performance.restaurant_rpc_ms],
    ["activity_rpc_ms", performance.activity_rpc_ms],
    ["rpc_ms", performance.rpc_ms],
    ["ranking_ms", performance.ranking_ms],
    ["pair_count", result.pair_count || debug.pair_count],
    ["restaurant_count", result.restaurants],
    ["activity_count", result.activities],
    ["fallbackUsed", result.fallbackUsed],
    ["intentParserSource", result.intentParserSource],
    ["fastPathMatched", result.fastPathMatched],
    ["fastPathReason", result.fastPathReason],
  ];
  return (
    <div className="mt-4 rounded-3xl border border-white/10 bg-black/20 p-4">
      <div className="flex flex-wrap gap-2">
        {speedStatus === "critical" ? <span className="rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white">Critical speed</span> : null}
        {totalMs > 5000 ? <span className="rounded-full bg-amber-400 px-3 py-1 text-xs font-black text-black">Over 5s</span> : null}
        {totalMs > 8000 ? <span className="rounded-full bg-red-300 px-3 py-1 text-xs font-black text-black">Over 8s</span> : null}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-4">
        {fields.map(([label, value]) => (
          <div key={String(label)} className="rounded-2xl bg-white/[.04] p-2">
            <p className="text-[10px] text-white/45">{String(label)}</p>
            <p className="break-words text-xs font-black text-white/85">{formatValue(value)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultDetails({ result }: { result: SearchLabResult }) {
  return (
    <>
      <PerformanceSummary result={result} />
      <div className="mt-3 grid gap-3 md:grid-cols-5">
        {[
          ["Restaurants", result.restaurants],
          ["Activities", result.activities],
          ["Pairs", result.pairs],
          ["Speed", result.speedStatus || result.speed_status],
          ["Fallback", String(result.fallbackUsed)],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-2xl bg-white/[.04] p-3">
            <p className="text-xs text-white/50">{String(k)}</p>
            <p className="font-black">{formatValue(v)}</p>
          </div>
        ))}
      </div>
      <SearchDebugFields result={result} />
      <h3 className="mt-5 font-black">Search speed breakdown</h3>
      <pre className="mt-2 overflow-auto rounded-2xl bg-black/40 p-4 text-xs text-white/60">{JSON.stringify(result.performance, null, 2)}</pre>
      <h3 className="mt-5 font-black">Parsed intent</h3>
      <pre className="mt-2 overflow-auto rounded-2xl bg-black/40 p-4 text-xs text-white/60">{JSON.stringify(result.parsedIntent, null, 2)}</pre>
      <details className="mt-5">
        <summary className="cursor-pointer font-black text-rose-200">Debug accordion</summary>
        <pre className="mt-2 overflow-auto rounded-2xl bg-black/40 p-4 text-xs text-white/60">{JSON.stringify(result.debug, null, 2)}</pre>
      </details>
    </>
  );
}

export default function SearchLabClient({ initialQuery }: { initialQuery: string }) {
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<SearchLabResult | null>(null);
  const [batchResults, setBatchResults] = useState<SearchLabBatchResult[]>([]);
  const [copiedAllBatchResults, setCopiedAllBatchResults] = useState(false);
  const [copiedBatchResultIndex, setCopiedBatchResultIndex] = useState<number | null>(null);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(q = query) {
    setQuery(q);
    setLoading(true);
    setError(null);
    setResult(null);
    setBatchResults([]);
    setCopiedAllBatchResults(false);
    setCopiedBatchResultIndex(null);

    const searchLines = getNonEmptySearchLines(q);
    const runSingleSearch = async (line: string) => {
      const res = await fetch("/api/admin/beta/search-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: line, rawQuery: line, usedCustomPrompt: true }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Search test failed.");
      return json;
    };

    try {
      if (searchLines.length > 1) {
        const settledResults = await Promise.allSettled(searchLines.map((line) => runSingleSearch(line)));
        setBatchResults(
          settledResults.map((settled, index) => {
            const originalQuery = searchLines[index];
            if (settled.status === "fulfilled") {
              return { query: originalQuery, success: true, data: settled.value };
            }
            return {
              query: originalQuery,
              success: false,
              error: settled.reason instanceof Error ? settled.reason.message : "Search test failed.",
            };
          }),
        );
        return;
      }

      const singleQuery = searchLines[0] || q.trim();
      setResult(await runSingleSearch(singleQuery));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search test failed.");
    } finally {
      setLoading(false);
    }
  }


  async function copyWithFeedback(key: string, text: string) {
    const copied = await copyTextToClipboard(text);
    setCopiedAction(copied ? key : "copy-failed");
    window.setTimeout(() => setCopiedAction(null), 1500);
  }

  async function handleCopyAllBatchResults() {
    if (!batchResults.length) return;

    await copyTextToClipboard(formatAllBatchResultsForCopy(batchResults));
    setCopiedAllBatchResults(true);

    window.setTimeout(() => {
      setCopiedAllBatchResults(false);
    }, 2000);
  }

  async function handleCopyBatchResult(index: number) {
    const result = batchResults[index];
    if (!result) return;

    await copyTextToClipboard(formatBatchResultForCopy(result));
    setCopiedBatchResultIndex(index);

    window.setTimeout(() => {
      setCopiedBatchResultIndex(null);
    }, 2000);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-28 w-full rounded-2xl border border-white/10 bg-black/30 p-4 text-white"
          placeholder="Enter a beta tester prompt"
        />
        <button onClick={() => run()} disabled={loading} className="mt-3 rounded-full bg-rose-600 px-5 py-3 text-sm font-black disabled:opacity-60">
          {loading ? "Running..." : "Run test search"}
        </button>
        <div className="mt-3 flex flex-wrap gap-2">
          {examples.map((e) => (
            <button key={e} onClick={() => run(e)} className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70">
              {e}
            </button>
          ))}
        </div>
      </div>

      {error ? <div className="rounded-3xl border border-red-400/30 bg-red-500/10 p-5 font-semibold text-red-100">{error}</div> : null}

      {batchResults.length > 0 ? (
        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.2em] text-rose-200">Batch search test</p>
              <h2 className="mt-2 text-2xl font-black">Testing {batchResults.length} searches one at a time</h2>
            </div>
            <button
              type="button"
              onClick={handleCopyAllBatchResults}
              disabled={!batchResults.length}
              className="rounded-full border border-rose-300/40 bg-rose-600/20 px-4 py-2 text-sm font-black text-rose-50 transition hover:bg-rose-600/30 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {copiedAllBatchResults ? "Copied all results" : "Copy all results"}
            </button>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-4">
            {Object.entries(getBatchPerformanceSummary(batchResults)).map(([label, value]) => (
              <div key={label} className="rounded-2xl bg-white/[.04] p-3">
                <p className="text-xs text-white/50">{label}</p>
                <p className="break-words font-black">{formatValue(value)}</p>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-4">
            {batchResults.map((batchResult, index) => (
              <article key={`${batchResult.query}-${index}`} className={`rounded-3xl border p-5 ${batchResult.success ? "border-white/10 bg-white/[.03]" : "border-red-400/40 bg-red-500/10"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <h3 className="min-w-0 flex-1 text-xl font-black">{batchResult.query}</h3>
                  <button
                    type="button"
                    onClick={() => handleCopyBatchResult(index)}
                    className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-xs font-black text-white/80 transition hover:bg-white/[.1]"
                  >
                    {copiedBatchResultIndex === index ? "Copied" : "Copy this result"}
                  </button>
                </div>
                {batchResult.success && batchResult.data ? <ResultDetails result={batchResult.data} /> : <p className="mt-3 font-semibold text-red-100">Error: {batchResult.error || "Search test failed."}</p>}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {result ? (
        <section className="rounded-3xl border border-white/10 bg-[#120d0b] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black">Results summary</h2>
              {copiedAction === "copy-failed" ? <p className="mt-1 text-sm font-semibold text-red-200">Could not copy. Please try again.</p> : null}
            </div>
            <div className="flex w-full flex-wrap gap-2 sm:w-auto">
              <button type="button" disabled={!getVisibleResults(result).cards.length && !getVisibleResults(result).pairs.length} onClick={() => copyWithFeedback("all-results", formatAllResultsForCopy(result, query))} className="w-full rounded-full border border-rose-300/40 bg-rose-600/20 px-3 py-2 text-xs font-black text-rose-50 disabled:opacity-50 sm:w-auto">{copiedAction === "all-results" ? "Copied" : "Copy All Results"}</button>
              <button type="button" disabled={!result.debug && !result.debugParity} onClick={() => copyWithFeedback("debug-json", formatDebugJsonForCopy(result))} className="w-full rounded-full border border-white/15 bg-white/[.06] px-3 py-2 text-xs font-black text-white/80 disabled:opacity-50 sm:w-auto">{copiedAction === "debug-json" ? "Copied" : "Copy Debug JSON"}</button>
              <button type="button" onClick={() => copyWithFeedback("prompt-summary", formatPromptSummaryForCopy(result, query))} className="w-full rounded-full border border-white/15 bg-white/[.06] px-3 py-2 text-xs font-black text-white/80 sm:w-auto">{copiedAction === "prompt-summary" ? "Copied" : "Copy Prompt + Summary"}</button>
            </div>
          </div>
          <ResultDetails result={result} />
          <div className="mt-5 space-y-3">
            {[...getVisibleResults(result).cards.map((card: any) => ({ type: "card", item: card })), ...getVisibleResults(result).pairs.map((pair: any) => ({ type: "pair", item: pair }))].map((entry, index) => (
              <article key={`${entry.type}-${index}`} className="rounded-2xl border border-white/10 bg-white/[.03] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/40">{entry.type === "pair" ? "Pair" : getSearchTypeLabel(entry.item)}</p>
                    <h3 className="font-black">{entry.type === "pair" ? `${getName(entry.item?.restaurant || {}) || "Restaurant"} + ${getName(entry.item?.activity || {}) || "Activity"}` : getName(entry.item) || "Result"}</h3>
                  </div>
                  <button type="button" onClick={() => copyWithFeedback(`result-${index}`, entry.type === "pair" ? formatPairForCopy(entry.item, { query }) : formatSearchResultForCopy(entry.item, { query }))} className="rounded-full border border-white/15 bg-white/[.06] px-3 py-1.5 text-xs font-black text-white/80">{copiedAction === `result-${index}` ? "Copied" : "Copy Result"}</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
