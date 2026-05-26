import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

type SearchParams = { type?: string; q?: string };

const safeNumber = (value: unknown) => (typeof value === "number" ? value : Number(value || 0));

export default async function AdminReviewsPage({ searchParams }: { searchParams?: SearchParams }) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const type = searchParams?.type || "all";
  const q = (searchParams?.q || "").trim().toLowerCase();

  const { data, error } = await supabaseAdmin
    .from("location_reviews")
    .select("id,customer_name,rating,review_text,status,created_at,location_id,locations:location_id(name,restaurant_name,activity_name,address,neighborhood,borough,location_type)")
    .order("created_at", { ascending: false })
    .limit(250);

  const missingTable = String(error?.message || "").toLowerCase().includes("could not find the table") || String(error?.message || "").toLowerCase().includes("schema cache");
  const reviews = (data || []).map((r: any) => {
    const locationName = r.locations?.name || r.locations?.restaurant_name || r.locations?.activity_name || "Unknown location";
    const rawType = String(r.locations?.location_type || "").toLowerCase();
    const locationType = rawType === "restaurant" || r.locations?.restaurant_name ? "restaurant" : rawType === "activity" || r.locations?.activity_name ? "activity" : "unknown";
    const searchBlob = `${locationName} ${r.locations?.address || ""} ${r.locations?.neighborhood || ""} ${r.locations?.borough || ""}`.toLowerCase();
    return { ...r, locationName, locationType, searchBlob };
  }).filter((r: any) => (type === "restaurants" ? r.locationType === "restaurant" : type === "activities" ? r.locationType === "activity" : true)).filter((r: any) => !q || r.searchBlob.includes(q));

  const total = reviews.length;
  const restaurantReviews = reviews.filter((r: any) => r.locationType === "restaurant").length;
  const activityReviews = reviews.filter((r: any) => r.locationType === "activity").length;
  const pendingReviews = reviews.filter((r: any) => ["pending", "flagged"].includes(String(r.status || "").toLowerCase())).length;
  const avg = total ? (reviews.reduce((s: number, r: any) => s + safeNumber(r.rating), 0) / Math.max(total, 1)).toFixed(2) : "No data yet";

  return <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-24 text-white sm:px-6 lg:px-10"><section className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h1 className="text-3xl font-black">Reviews</h1><p className="text-sm text-white/70">Admin review visibility from location_reviews.</p><div className="mt-4 grid gap-3 sm:grid-cols-5">{[["Total reviews",total],["Average rating",avg],["Restaurant reviews",restaurantReviews],["Activity reviews",activityReviews],["Pending/flagged",pendingReviews]].map((s)=><div key={String(s[0])} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-rose-200">{s[0]}</p><p className="text-2xl font-bold">{String(s[1])}</p></div>)}</div><div className="mt-6 flex flex-wrap gap-2"><a href="?type=all" className="rounded-full border border-white/15 px-4 py-2 text-sm">All</a><a href="?type=restaurants" className="rounded-full border border-white/15 px-4 py-2 text-sm">Restaurants</a><a href="?type=activities" className="rounded-full border border-white/15 px-4 py-2 text-sm">Activities</a></div>{(error && !missingTable) ? <p className="mt-4 text-rose-300">Could not load reviews right now.</p> : null}{(missingTable || reviews.length === 0) ? <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center text-white/70">No reviews found yet.</div> : <div className="mt-6 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-white/60"><th>Reviewer</th><th>Location</th><th>Type</th><th>Rating</th><th>Snippet</th><th>Status</th><th>Created</th></tr></thead><tbody>{reviews.map((r:any)=><tr key={r.id} className="border-t border-white/10"><td className="py-2">{r.customer_name || "Guest"}</td><td>{r.locationName}</td><td className="capitalize">{r.locationType}</td><td>{r.rating ? Number(r.rating).toFixed(1) : "No data yet"}</td><td>{(r.review_text || "No data yet").slice(0,90)}</td><td>{r.status || "No data yet"}</td><td>{r.created_at ? new Date(r.created_at).toLocaleString() : "No data yet"}</td></tr>)}</tbody></table></div>}</section></main>;
}
