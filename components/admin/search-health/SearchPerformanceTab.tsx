import {
  extractPerformanceTimings,
  formatUnknown,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
export function TimingBars({
  event,
  names,
}: {
  event: SearchExplorerEvent;
  names?: string[];
}) {
  const timings = extractPerformanceTimings(event);
  const shown = names ?? Object.keys(timings);
  const max = Math.max(1, ...shown.map((k) => timings[k] ?? 0));
  return (
    <div className="space-y-3">
      {shown.map((name) => {
        const duration = timings[name];
        return (
          <div
            className="grid items-center gap-3 sm:grid-cols-[130px_90px_1fr]"
            key={name}
          >
            <span className="text-xs font-black capitalize text-white/60">
              {name}
            </span>
            <span className="text-xs tabular-nums text-white/80">
              {duration == null
                ? "No timing recorded"
                : `${formatUnknown(duration)} ms`}
            </span>
            <div
              className="h-2 overflow-hidden rounded-full bg-white/8"
              aria-label={`${name} relative duration`}
            >
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-700 to-rose-400"
                style={{
                  width:
                    duration == null
                      ? 0
                      : `${Math.max(2, (duration / max) * 100)}%`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
export default function SearchPerformanceTab({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <span className="text-xs font-black uppercase tracking-wider text-white/40">
          Stored speed status
        </span>
        <strong className="capitalize text-rose-200">
          {event.speed_status ||
            (event.success === false ? "Failed" : "Not classified")}
        </strong>
      </div>
      <TimingBars event={event} />
    </div>
  );
}
