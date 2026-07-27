import {
  formatUnknown,
  getNested,
  isRecord,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
type Item = {
  id?: unknown;
  name?: unknown;
  rank?: unknown;
  score?: unknown;
  distance?: unknown;
  reason?: unknown;
};
function normalize(value: unknown): Item[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) =>
    isRecord(item)
      ? {
          id: item.id,
          name: item.name ?? item.title,
          rank: item.rank ?? index + 1,
          score: item.score ?? item.finalScore,
          distance: item.distance ?? item.distanceMiles,
          reason: item.reason ?? item.reasonSelected,
        }
      : { id: item, rank: index + 1 },
  );
}
function Group({
  title,
  items,
  count,
}: {
  title: string;
  items: Item[];
  count: unknown;
}) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
      <div className="flex justify-between">
        <h3 className="font-black">{title}</h3>
        <span className="text-xs text-white/40">
          Logged count: {formatUnknown(count)}
        </span>
      </div>
      {items.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <article
              className="rounded-xl border border-white/8 bg-black/20 p-3"
              key={`${String(item.id)}-${index}`}
            >
              <p className="font-bold">{formatUnknown(item.name ?? item.id)}</p>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/50">
                <div>
                  <dt>ID</dt>
                  <dd className="break-all text-white/75">
                    {formatUnknown(item.id)}
                  </dd>
                </div>
                <div>
                  <dt>Rank</dt>
                  <dd>{formatUnknown(item.rank)}</dd>
                </div>
                <div>
                  <dt>Score</dt>
                  <dd>{formatUnknown(item.score)}</dd>
                </div>
                <div>
                  <dt>Distance</dt>
                  <dd>{formatUnknown(item.distance)}</dd>
                </div>
              </dl>
              {item.reason != null ? (
                <p className="mt-2 text-xs text-white/50">
                  Reason: {formatUnknown(item.reason)}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/45">
          Result details were not stored for this search. Counts may still be
          available above.
        </p>
      )}
    </section>
  );
}
export default function SearchResultsTab({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  const restaurants = normalize(
    getNested(
      event,
      "metadata.restaurants",
      "metadata.restaurantResults",
      "metadata.result_ids",
      "metadata.ml_result_ids",
    ),
  );
  const activities = normalize(
    getNested(
      event,
      "metadata.activities",
      "metadata.activityResults",
      "metadata.activity_ids",
    ),
  );
  const pairs = normalize(
    getNested(
      event,
      "metadata.pairs",
      "metadata.pairResults",
      "metadata.pair_ids",
      "metadata.ml_pair_ids",
    ),
  );
  return (
    <div className="space-y-4">
      <Group
        title="Restaurants"
        items={restaurants}
        count={event.restaurant_count}
      />
      <Group
        title="Activities"
        items={activities}
        count={event.activity_count}
      />
      <Group title="Pairs" items={pairs} count={event.pair_count} />
    </div>
  );
}
