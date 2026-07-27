import {
  extractPerformanceTimings,
  getNested,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
const stages = [
  "Request Parse",
  "Identity",
  "Limit Check",
  "Intent",
  "Geo",
  "Anchor",
  "Restaurant Search",
  "Activity Search",
  "Pair Builder",
  "Ranking",
  "ML",
  "Normalization",
  "Telemetry",
  "Response",
];
const timingKey: Record<string, string> = {
  "Request Parse": "parse",
  Identity: "identity",
  "Limit Check": "limit",
  Intent: "intent",
  Geo: "geo",
  Anchor: "anchor",
  "Restaurant Search": "search",
  "Activity Search": "search",
  "Pair Builder": "pairing",
  Ranking: "ranking",
  Normalization: "normalize",
  Telemetry: "telemetry",
  Response: "total",
};
export default function SearchPipelineTab({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  const timings = extractPerformanceTimings(event);
  const max = Math.max(1, ...Object.values(timings).map((v) => v ?? 0));
  return (
    <ol className="space-y-2">
      {stages.map((stage, index) => {
        const key = timingKey[stage],
          duration = key ? timings[key] : null;
        const detail = getNested(
          event,
          `metadata.performance.stages.${key}`,
          `debug.timings.${key}`,
          `metadata.searchTelemetry.${key}`,
        );
        return (
          <li
            className="grid gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 sm:grid-cols-[32px_180px_1fr_auto] sm:items-center"
            key={stage}
          >
            <span className="grid size-7 place-items-center rounded-full bg-rose-500/15 text-xs font-black text-rose-200">
              {index + 1}
            </span>
            <div>
              <p className="text-sm font-black">{stage}</p>
              <p className="text-[11px] text-white/35">
                {duration == null ? "No timing recorded" : `${duration} ms`}
              </p>
            </div>
            <div className="h-1.5 rounded-full bg-white/8">
              <div
                className="h-full rounded-full bg-rose-500"
                style={{
                  width:
                    duration == null
                      ? 0
                      : `${Math.max(2, (duration / max) * 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-white/45">
              {detail && typeof detail === "object"
                ? "Details recorded"
                : duration == null
                  ? "Not recorded"
                  : "Complete"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
