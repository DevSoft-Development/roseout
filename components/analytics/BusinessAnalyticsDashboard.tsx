"use client";

import { useEffect, useMemo, useState } from "react";

type LocationOption = { id: string; display_name: string; city?: string | null; state?: string | null; is_pro?: boolean };
type Props = { locations: LocationOption[]; admin?: boolean };

const ranges = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
  { value: "12m", label: "12 months" },
  { value: "all", label: "All" },
];

export default function BusinessAnalyticsDashboard({ locations, admin = false }: Props) {
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || "");
  const [range, setRange] = useState("30d");
  const [q, setQ] = useState("");
  const [data, setData] = useState<any>(null);

  const selectedLocation = useMemo(() => locations.find((location) => location.id === selectedLocationId) || locations[0], [locations, selectedLocationId]);

  useEffect(() => {
    const endpoint = admin ? "/api/admin/business-analytics" : "/api/business/analytics";
    const qs = new URLSearchParams({ range });
    if (selectedLocationId) qs.set("location_id", selectedLocationId);
    if (admin && q.trim()) qs.set("q", q.trim());
    fetch(`${endpoint}?${qs.toString()}`)
      .then((response) => response.json())
      .then(setData)
      .catch(() => setData(null));
  }, [selectedLocationId, range, admin, q]);

  const s = data?.summary || {};
  const cards = admin
    ? [["Locations", s.total_locations ?? 0], ["Profile Views", s.profile_views ?? 0], ["Search Clicks", s.search_clicks ?? 0], ["Outing Completions", s.completed_outings ?? 0]]
    : [["Profile Views", s.profile_views ?? 0], ["Search Clicks", s.search_clicks ?? 0], ["Reserve Clicks", s.reservation_starts ?? 0], ["Completed Outings", s.reservation_completions ?? 0]];

  return (
    <main className="toh-page">
      <section className="toh-container py-10">
        <div className="toh-card rounded-[2rem] p-6 sm:p-8">
          <p className="toh-muted text-xs font-black uppercase tracking-[0.22em]">{admin ? "Admin Business Analytics" : "Owner Analytics"}</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">{admin ? "TheOutHaven Bird’s Eye View" : "Your Claimed Location Performance"}</h1>
          <p className="toh-muted mt-2 text-sm">{admin ? "Platform-wide intelligence with per-location drilldowns and search behavior insights." : "Conversion and outing performance for locations you can manage."}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            {!!locations.length && <select value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)} className="toh-glass rounded-full px-4 py-2 text-sm font-semibold">{locations.map((l) => <option key={l.id} value={l.id}>{l.display_name}</option>)}</select>}
            <select value={range} onChange={(e) => setRange(e.target.value)} className="toh-glass rounded-full px-4 py-2 text-sm font-semibold">{ranges.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select>
            {admin && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search all locations inline" className="toh-glass rounded-full px-4 py-2 text-sm font-semibold" />}
          </div>
        </div>

        {!locations.length && <div className="mt-6 toh-glass rounded-3xl p-5"><p className="text-lg font-black">No locations available yet</p><p className="toh-muted mt-2 text-sm">When locations are claimed or created, analytics will populate here.</p></div>}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={String(label)} className="toh-card rounded-3xl p-5">
              <p className="toh-muted text-xs uppercase tracking-[0.16em]">{label}</p>
              <p className="mt-2 text-3xl font-black">{Number(value).toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="toh-glass rounded-3xl p-5">
            <p className="text-lg font-black">Top locations</p>
            <ul className="mt-4 space-y-2 text-sm">
              {(data?.top_locations || locations.slice(0, 8)).map((l: any) => <li key={l.id} className="flex items-center justify-between"><span>{l.name || l.display_name}</span><span className="toh-muted">{l.city || "—"}</span></li>)}
            </ul>
          </div>
          <div className="toh-glass rounded-3xl p-5">
            <p className="text-lg font-black">Recent tracked activity</p>
            <div className="mt-4 space-y-2 text-sm">
              {(data?.recent_activity || []).slice(0, 10).map((item: any, i: number) => { const ts = item?.created_at ? new Date(item.created_at).toLocaleString() : "—"; return <p key={`${item.id || i}`} className="toh-muted">{item.event_name || item.event_type || item?.metadata?.event_name || "event"} · {ts}</p>; })}
              {!data?.recent_activity?.length && <p className="toh-muted">No tracked activity in this range yet.</p>}
            </div>
          </div>
        </div>

        {admin && <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <div className="toh-glass rounded-3xl p-5 xl:col-span-2">
            <p className="text-lg font-black">Bird’s Eye View · All locations</p>
            <div className="mt-3 space-y-2 text-sm">
              {(data?.all_locations || []).slice(0, 20).map((l: any) => <div key={l.id} className="flex items-center justify-between border-b border-white/10 py-2"><span>{l.name}</span><span className="toh-muted">CTR {Math.round((l.completion_rate || 0) * 100)}%</span></div>)}
              {!data?.all_locations?.length && <p className="toh-muted">No locations match this search.</p>}
            </div>
          </div>
          <div className="toh-glass rounded-3xl p-5">
            <p className="text-lg font-black">Most searched categories</p>
            <div className="mt-3 space-y-2 text-sm">
              {(data?.most_searched_categories || []).map((c: any, i: number) => <div key={`${c.category}-${i}`} className="flex justify-between"><span>{c.category}</span><span className="toh-muted">{c.count}</span></div>)}
              {!data?.most_searched_categories?.length && <p className="toh-muted">Not enough search signal yet.</p>}
            </div>
          </div>
        </div>}

        <div className="mt-6 toh-glass rounded-3xl p-5">
          <p className="text-lg font-black">{admin ? "Admin location drilldown" : "Location snapshot"}</p>
          <p className="mt-3 text-sm">Current location: <span className="font-bold">{selectedLocation?.display_name || data?.admin_location_drilldown?.name || "None"}</span></p>
          <p className="toh-muted mt-2 text-sm">{admin ? "Use inline search and location selector for deeper breakdowns and event-level timelines." : "Metrics are privacy-safe and scoped to your authorized locations only."}</p>
        </div>
      </section>
    </main>
  );
}
