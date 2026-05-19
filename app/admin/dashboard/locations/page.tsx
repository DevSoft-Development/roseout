import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { supabase } from "@/lib/supabase";

type SP = { q?: string; page?: string };

export default async function Page({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminRole(["superuser", "admin", "editor", "viewer"]);
  const sp = await searchParams;
  const q = (sp.q || "").trim();
  const page = Math.max(1, Number(sp.page || 1));
  const pageSize = 30;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let r = supabase.from("restaurants").select("id,name,restaurant_name,city,state,rating,is_claimed,reservation_link,quality_score,recommendation_score", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  let a = supabase.from("activities").select("id,name,activity_name,city,state,rating,is_claimed,reservation_link,quality_score,recommendation_score", { count: "exact" }).order("created_at", { ascending: false }).range(from, to);
  if (q) {
    r = r.or(`name.ilike.%${q}%,restaurant_name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%`);
    a = a.or(`name.ilike.%${q}%,activity_name.ilike.%${q}%,city.ilike.%${q}%,state.ilike.%${q}%`);
  }
  const [rr, aa] = await Promise.all([r, a]);
  const items = [
    ...(rr.data || []).map((x:any) => ({...x, type:"Restaurant"})),
    ...(aa.data || []).map((x:any) => ({...x, type:"Activity"})),
  ];

  return <div className="space-y-6 p-6">
    <div className="flex items-end justify-between"><div><h1 className="text-3xl font-bold">Locations</h1><p className="text-sm text-neutral-500">Admin command center</p></div></div>
    <form className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search name, city, state, category, phone, place id..." className="w-full rounded-xl border px-4 py-2"/><button className="rounded-xl bg-black px-4 py-2 text-white">Search</button></form>
    <div className="rounded-2xl border bg-white">
      <table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Name</th><th>Type</th><th>City/State</th><th>Rating</th><th>Claim</th><th>Reservation</th><th>Opportunity</th><th></th></tr></thead><tbody>
        {items.map((x:any)=><tr key={`${x.type}-${x.id}`} className="border-b"><td className="p-3 font-semibold">{x.name || x.restaurant_name || x.activity_name}</td><td>{x.type}</td><td>{x.city || "—"}, {x.state || "—"}</td><td>{x.rating ?? "—"}</td><td>{x.is_claimed ? "Claimed" : "Unclaimed"}</td><td>{x.reservation_link ? "Linked" : "Missing"}</td><td>{Math.round(((x.quality_score||0)+(x.recommendation_score||0))/2)}</td><td><Link className="rounded border px-2 py-1" href={`/admin/dashboard/locations/${x.id}`}>View</Link></td></tr>)}
      </tbody></table>
    </div>
  </div>;
}
