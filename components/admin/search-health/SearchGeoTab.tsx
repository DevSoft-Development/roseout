import MetricCard from "./MetricCard";
import {
  getNested,
  type SearchExplorerEvent,
} from "@/lib/admin/search-explorer";
export default function SearchGeoTab({
  event,
}: {
  event: SearchExplorerEvent;
}) {
  const v = (...p: string[]) => getNested(event, ...p);
  const lat = v(
      "latitude",
      "metadata.latitude",
      "metadata.geo.latitude",
      "debug.geo.latitude",
    ),
    lng = v(
      "longitude",
      "metadata.longitude",
      "metadata.geo.longitude",
      "debug.geo.longitude",
    );
  const fields: [string, unknown][] = [
    [
      "Requested Market",
      v("metadata.requestedMarket", "debug.requestedMarket"),
    ],
    [
      "Resolved Market",
      v("metadata.resolvedMarket", "metadata.market", "debug.resolvedMarket"),
    ],
    ["Default Market", event.default_market_id],
    ["City", event.city],
    ["State", event.state],
    ["Borough", event.borough],
    ["Neighborhood", event.neighborhood],
    ["Latitude", lat],
    ["Longitude", lng],
    ["Radius", v("radius_miles", "metadata.radius", "metadata.geo.radius")],
    [
      "Distance Mode",
      v("distance_mode", "metadata.distanceMode", "debug.distanceMode"),
    ],
    ["Geo Source", v("metadata.geoSource", "debug.geoSource")],
    [
      "Explicit Market Requested",
      v("metadata.explicitMarketRequested", "debug.explicitMarketRequested"),
    ],
    [
      "Explicit Geo Requested",
      v("metadata.explicitGeoRequested", "debug.explicitGeoRequested"),
    ],
    ["Canonical Latitude Present", lat != null],
    ["Canonical Longitude Present", lng != null],
    [
      "User Location Used as Primary Geo",
      v(
        "metadata.userLocationUsedAsPrimaryGeo",
        "debug.userLocationUsedAsPrimaryGeo",
      ),
    ],
    [
      "User Location Used as Soft Boost",
      v(
        "metadata.userLocationUsedAsSoftBoost",
        "debug.userLocationUsedAsSoftBoost",
      ),
    ],
  ];
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-dashed border-rose-400/25 bg-rose-500/[0.04] p-6">
        <p className="text-xs font-black uppercase tracking-wider text-rose-300">
          Coordinate summary · Map reserved for Phase 2
        </p>
        <p className="mt-3 font-mono text-lg">
          {lat ?? "—"}, {lng ?? "—"}
        </p>
        <p className="mt-2 text-sm text-white/45">
          No mapping dependency or external request is used in Phase 1.
        </p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {fields.map(([label, value]) => (
          <MetricCard key={label} label={label} value={value} />
        ))}
      </dl>
    </div>
  );
}
