import {
  formatUnknown,
  getNested,
  isRecord,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
export default function SearchRankingTab({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  const raw = getNested(
    event,
    "metadata.ranking",
    "metadata.rankedResults",
    "metadata.rankingBreakdown",
    "debug.ranking",
    "debug.rankedResults",
  );
  const items = Array.isArray(raw)
    ? raw
    : isRecord(raw)
      ? Object.entries(raw).map(([candidate, value]) =>
          isRecord(value)
            ? { candidate, ...value }
            : { candidate, finalScore: value },
        )
      : [];
  if (!items.length)
    return (
      <div className="rounded-2xl border border-dashed border-white/15 p-8 text-center">
        <h3 className="font-black">
          Ranking detail was not recorded for this search
        </h3>
        <p className="mt-2 text-sm text-white/45">
          Phase 1 only displays ranking evidence already present in event
          metadata.
        </p>
      </div>
    );
  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const value = isRecord(item) ? item : {};
        return (
          <details
            className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
            key={index}
          >
            <summary className="cursor-pointer font-black focus-visible:outline-2 focus-visible:outline-rose-400">
              #{formatUnknown(value.rank ?? index + 1)} ·{" "}
              {formatUnknown(value.candidate ?? value.name ?? value.id)}
            </summary>
            <dl className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ["Base Score", value.baseScore],
                ["Boosts", value.boosts],
                ["Penalties", value.penalties],
                ["ML Score", value.mlScore],
                ["Final Score", value.finalScore ?? value.score],
                ["Reason", value.reason ?? value.rankingReasons],
              ].map(([label, v]) => (
                <div key={String(label)}>
                  <dt className="text-[10px] font-black uppercase text-white/35">
                    {label}
                  </dt>
                  <dd className="mt-1 break-words text-sm">
                    {formatUnknown(v)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        );
      })}
    </div>
  );
}
