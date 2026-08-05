import MetricCard from "./MetricCard";
import {
  getNested,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
export default function SearchIntentTab({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  const v = (...p: string[]) => getNested(event, ...p);
  const fields: [string, unknown][] = [
    [
      "Restaurant Needed",
      v(
        "needs_restaurant",
        "metadata.needsRestaurant",
        "metadata.normalizedIntent.needsRestaurant",
        "debug.normalizedIntent.needsRestaurant",
      ),
    ],
    [
      "Activity Needed",
      v(
        "needs_activity",
        "metadata.needsActivity",
        "metadata.normalizedIntent.needsActivity",
        "debug.normalizedIntent.needsActivity",
      ),
    ],
    [
      "Wants Pairing",
      v(
        "wants_pairing",
        "metadata.wantsPairing",
        "metadata.normalizedIntent.wantsPairing",
        "debug.normalizedIntent.wantsPairing",
      ),
    ],
    [
      "Walking Requested",
      v(
        "metadata.walkingRequested",
        "metadata.normalizedIntent.walkingRequested",
        "debug.normalizedIntent.walkingRequested",
      ),
    ],
    [
      "Same Venue Preferred",
      v(
        "metadata.sameVenuePreferred",
        "debug.normalizedIntent.sameVenuePreferred",
      ),
    ],
    ["Strict Geo", v("metadata.strictGeo", "debug.normalizedIntent.strictGeo")],
    ["Date", v("outing_date", "metadata.normalizedIntent.date")],
    ["Time", v("outing_time", "metadata.normalizedIntent.time")],
    ["Ranking Mode", v("metadata.rankingMode", "debug.rankingMode")],
    [
      "Intent Confidence",
      v("metadata.intentConfidence", "debug.intentConfidence"),
    ],
    [
      "LLM Used",
      v("metadata.llmUsed", "metadata.debugParity.llmUsed", "debug.llmUsed"),
    ],
    ["Fast Path Used", v("metadata.fastPathUsed", "debug.fastPathUsed")],
    [
      "Fallback Parser Used",
      v("metadata.fallbackParserUsed", "debug.fallbackParserUsed"),
    ],
    [
      "Recovery Layer Used",
      v("metadata.recoveryLayerUsed", "debug.recoveryLayerUsed"),
    ],
    [
      "Partial Results Returned",
      v("metadata.partialResultsReturned", "debug.partialResultsReturned"),
    ],
  ];
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map(([label, value]) => (
        <MetricCard key={label} label={label} value={value} />
      ))}
    </dl>
  );
}
