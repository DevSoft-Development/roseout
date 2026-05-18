import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getLocationName } from "@/lib/locationName";
import BusinessAnalyticsDashboard from "@/components/analytics/BusinessAnalyticsDashboard";

export const dynamic = "force-dynamic";

export default async function AdminAnalyticsPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);

  const [{ data: locations }, { data: topDaily }] = await Promise.all([
    supabaseAdmin
      .from("locations")
      .select("id, name, restaurant_name, activity_name, business_name, city, state")
      .order("created_at", { ascending: false })
      .limit(250),
    supabaseAdmin
      .from("location_daily_analytics")
      .select("location_id, profile_views, search_clicks, reservation_completions, total_revenue, reservation_starts")
      .order("profile_views", { ascending: false })
      .limit(1000),
  ]);

  const options = (locations || []).map((location: any) => ({
    id: location.id,
    display_name: getLocationName(location, "Untitled location"),
    city: location.city || null,
    state: location.state || null,
    is_pro: true,
  }));

  const locationNames = new Map(options.map((location) => [location.id, location.display_name]));
  const topRows = Object.values(
    (topDaily || []).reduce<Record<string, any>>((acc, row: any) => {
      const current = acc[row.location_id] || { location_id: row.location_id, profile_views: 0, search_clicks: 0, reservations: 0, revenue: 0, starts: 0 };
      current.profile_views += Number(row.profile_views || 0);
      current.search_clicks += Number(row.search_clicks || 0);
      current.reservations += Number(row.reservation_completions || 0);
      current.revenue += Number(row.total_revenue || 0);
      current.starts += Number(row.reservation_starts || 0);
      acc[row.location_id] = current;
      return acc;
    }, {}),
  )
    .sort((a: any, b: any) => b.profile_views - a.profile_views)
    .slice(0, 10);

  return (
    <>
      <BusinessAnalyticsDashboard locations={options} admin />
      <section className="bg-[#090706] px-5 pb-12 text-white sm:px-8">
        <div className="mx-auto max-w-7xl rounded-[2rem] border border-white/10 bg-[#12100f] p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#f5b700]">Admin comparison</p>
          <h2 className="text-2xl font-black">Top Performing Locations</h2>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-xs uppercase tracking-[0.18em] text-white/35">
                <tr>
                  <th className="py-3">Location</th>
                  <th>Profile views</th>
                  <th>Search clicks</th>
                  <th>Reservations</th>
                  <th>Revenue</th>
                  <th>Conversion rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {topRows.map((row: any) => (
                  <tr key={row.location_id} className="font-bold text-white/70">
                    <td className="py-3 text-white">{locationNames.get(row.location_id) || row.location_id}</td>
                    <td>{row.profile_views.toLocaleString()}</td>
                    <td>{row.search_clicks.toLocaleString()}</td>
                    <td>{row.reservations.toLocaleString()}</td>
                    <td>${Math.round(row.revenue).toLocaleString()}</td>
                    <td>{row.starts > 0 ? `${Math.round((row.reservations / row.starts) * 100)}%` : "0%"}</td>
                  </tr>
                ))}
                {topRows.length === 0 ? <tr><td colSpan={6} className="py-6 text-center font-bold text-white/35">No analytics data yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </>
  );
}
