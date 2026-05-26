import { requireAdminRole } from "@/lib/admin-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export default async function AdminReviewsPage() {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const [{ count: restaurantCount }, { count: activityCount }, { data: recent, error }] = await Promise.all([
    supabaseAdmin.from("reviews").select("id", { count: "exact", head: true }).eq("review_type", "restaurant"),
    supabaseAdmin.from("reviews").select("id", { count: "exact", head: true }).eq("review_type", "activity"),
    supabaseAdmin.from("reviews").select("id,rating,review_text,status,review_type,location_id,created_at").order("created_at", { ascending: false }).limit(25),
  ]);

  return <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-24 text-white sm:px-6 lg:px-10"><section className="mx-auto max-w-7xl rounded-3xl border border-white/10 bg-[#120d0b] p-6"><h1 className="text-3xl font-black">Reviews</h1><p className="text-sm text-white/70">All, restaurant, and activity reviews from production data.</p><div className="mt-4 grid gap-3 sm:grid-cols-3">{[{k:"Restaurant reviews",v:restaurantCount||0},{k:"Activity reviews",v:activityCount||0},{k:"Total",v:(restaurantCount||0)+(activityCount||0)}].map((s)=><div key={s.k} className="rounded-xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-[#f5b700]">{s.k}</p><p className="text-2xl font-bold">{s.v}</p></div>)}</div>{error?<p className="mt-4 text-red-300">Error: {error.message}</p>:<div className="mt-6 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-white/60"><th>User</th><th>Type</th><th>Rating</th><th>Snippet</th><th>Status</th><th>Created</th></tr></thead><tbody>{(recent||[]).map((r:any)=><tr key={r.id} className="border-t border-white/10"><td className="py-2">{r.location_id || "—"}</td><td>{r.review_type || "—"}</td><td>{Number(r.rating||0).toFixed(1)}</td><td>{(r.review_text || "No text").slice(0,90)}</td><td>{r.status || "published"}</td><td>{r.created_at ? new Date(r.created_at).toLocaleString() : "—"}</td></tr>)}{!recent?.length?<tr><td colSpan={6} className="py-5 text-center text-white/60">No reviews found.</td></tr>:null}</tbody></table></div>}</section></main>;
}
