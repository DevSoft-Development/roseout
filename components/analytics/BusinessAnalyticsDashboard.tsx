"use client";

import { useEffect, useMemo, useState } from "react";

type LocationOption = { id: string; display_name: string; city?: string | null; state?: string | null; is_pro?: boolean };

type Props = { locations: LocationOption[]; admin?: boolean };

export default function BusinessAnalyticsDashboard({ locations, admin = false }: Props) {
  const [selectedLocationId, setSelectedLocationId] = useState(locations[0]?.id || "");
  const [range, setRange] = useState("30d");
  const [data, setData] = useState<any>(null);

  const selectedLocation = useMemo(() => locations.find((location) => location.id === selectedLocationId) || locations[0], [locations, selectedLocationId]);

  useEffect(() => {
    if (!selectedLocationId) return;
    const endpoint = admin ? "/api/business/analytics" : "/api/business/analytics";
    fetch(`${endpoint}?location_id=${encodeURIComponent(selectedLocationId)}&range=${range}`)
      .then((response) => response.json())
      .then(setData)
      .catch(() => setData(null));
  }, [selectedLocationId, range, admin]);

  const s = data?.summary || {};
  const cards = [
    [admin ? "Platform Views" : "Profile Views", s.profile_views ?? 0],
    ["Search Clicks", s.search_clicks ?? 0],
    ["Reserve Clicks", s.reservation_starts ?? 0],
    ["Completed Outings", s.reservation_completions ?? 0],
  ];

  return (
    <main className="rose-page">
      <section className="rose-container py-10">
        <div className="rose-card rounded-[2rem] p-6 sm:p-8">
          <p className="rose-muted text-xs font-black uppercase tracking-[0.22em]">{admin ? "Admin Business Analytics" : "Location Analytics"}</p>
          <h1 className="mt-2 text-3xl font-black sm:text-5xl">{admin ? "TheOutHaven Analytics" : "Your Location Performance"}</h1>
          <p className="rose-muted mt-2 text-sm">{admin ? "Platform-wide and per-location intelligence." : "Actionable insights for your claimed locations."}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <select value={selectedLocationId} onChange={(e) => setSelectedLocationId(e.target.value)} className="rose-glass rounded-full px-4 py-2 text-sm font-semibold">
              {locations.map((l) => <option key={l.id} value={l.id}>{l.display_name}</option>)}
            </select>
            <select value={range} onChange={(e) => setRange(e.target.value)} className="rose-glass rounded-full px-4 py-2 text-sm font-semibold">
              <option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="12m">12 months</option><option value="all">All</option>
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([label, value]) => (
            <div key={String(label)} className="rose-card rounded-3xl p-5">
              <p className="rose-muted text-xs uppercase tracking-[0.16em]">{label}</p>
              <p className="mt-2 text-3xl font-black">{Number(value).toLocaleString()}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <div className="rose-glass rounded-3xl p-5">
            <p className="text-lg font-black">Top locations</p>
            <p className="rose-muted mt-1 text-sm">Coming from normalized event + outing signals.</p>
            <ul className="mt-4 space-y-2 text-sm">
              {locations.slice(0, 5).map((l) => <li key={l.id} className="flex items-center justify-between"><span>{l.display_name}</span><span className="rose-muted">{l.city || "—"}</span></li>)}
            </ul>
          </div>
          <div className="rose-glass rounded-3xl p-5">
            <p className="text-lg font-black">Recent tracked activity</p>
            <div className="mt-4 space-y-2 text-sm">
              {(data?.recent_activity || []).slice(0, 8).map((item: any, i: number) => { const ts = item?.created_at ? new Date(item.created_at).toLocaleString() : "—"; return <p key={`${item.id || i}`} className="rose-muted">{item.event_name || item.event_type || item?.metadata?.event_name || "event"} · {ts}</p>; })}
              {!data?.recent_activity?.length && <p className="rose-muted">No activity yet for this range.</p>}
            </div>
          </div>
        </div>

        <div className="mt-6 rose-glass rounded-3xl p-5">
          <p className="text-lg font-black">Locations needing attention</p>
          <p className="rose-muted mt-2 text-sm">Low completion or low click-through should be reviewed first.</p>
          <p className="mt-3 text-sm">Current location: <span className="font-bold">{selectedLocation?.display_name || "None"}</span></p>
        </div>
      </section>
    </main>
  );
}
