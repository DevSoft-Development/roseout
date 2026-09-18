import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Locations | TheOutHaven Admin" };

type SearchParams = { q?: string; type?: string; status?: string; page?: string };

function nameFor(row: Record<string, unknown>) {
  return String(row.name || row.restaurant_name || row.activity_name || "Unnamed location");
}

export default async function LocationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdminRole(["superadmin", "admin", "editor", "reviewer", "viewer"]);
  const params = await searchParams;
  const q = String(params.q || "").trim().slice(0, 100);
  const type = String(params.type || "all");
  const status = String(params.status || "all");
  const page = Math.max(1, Number(params.page || 1));
  const pageSize = 100;
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = getAdminDatabaseClient()
    .from("locations")
    .select("id,name,restaurant_name,activity_name,location_type,address,city,state,status,is_searchable,is_claimed,claim_status,rating,review_count,main_image,image_url,updated_at", { count: "exact" })
    .order("updated_at", { ascending: false })
    .range(from, to);

  if (q) {
    const safe = q.replace(/[%_,()]/g, " ");
    query = query.or(`name.ilike.%${safe}%,restaurant_name.ilike.%${safe}%,activity_name.ilike.%${safe}%,address.ilike.%${safe}%,city.ilike.%${safe}%`);
  }
  if (type !== "all") query = query.eq("location_type", type);
  if (status !== "all") query = query.eq("status", status);

  const { data, count, error } = await query;
  if (error) throw new Error(error.message);
  const rows = (data || []) as Array<Record<string, unknown>>;
  const total = count || 0;

  return <main className="min-h-screen bg-[#08050b] p-6 text-white">
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-200">Admin</p>
          <h1 className="mt-2 text-4xl font-black">Locations</h1>
          <p className="mt-2 text-white/60">Search, review, and manage canonical TheOutHaven locations.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/dashboard/locations/non-searchable" className="rounded-xl border border-white/15 px-4 py-3 font-bold">Non-searchable</Link>
          <Link href="/admin/dashboard/locations/duplicates" className="rounded-xl border border-white/15 px-4 py-3 font-bold">Duplicates</Link>
          <Link href="/admin/dashboard/locations/import" className="rounded-xl border border-white/15 px-4 py-3 font-bold">Import</Link>
          <Link href="/admin/dashboard/locations/google-enrichment" className="rounded-xl border border-white/15 px-4 py-3 font-bold">Google enrichment</Link>
        </div>
      </div>

      <form className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.04] p-4 md:grid-cols-[1fr_180px_180px_auto]">
        <input name="q" defaultValue={q} placeholder="Search name, address, city..." className="rounded-xl bg-black/50 p-3" />
        <select name="type" defaultValue={type} className="rounded-xl bg-black/50 p-3">
          <option value="all">All types</option><option value="restaurant">Restaurant</option><option value="activity">Activity</option>
        </select>
        <select name="status" defaultValue={status} className="rounded-xl bg-black/50 p-3">
          <option value="all">All statuses</option><option value="approved">Approved</option><option value="pending">Pending</option>
        </select>
        <button className="rounded-xl bg-white px-5 py-3 font-black text-black">Search</button>
      </form>

      <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
        {total.toLocaleString()} locations
      </div>

      <div className="overflow-hidden rounded-3xl border border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.06] text-left text-xs uppercase text-white/45"><tr><th className="p-3">Location</th><th>Type</th><th>Status</th><th>Search</th><th>Claim</th><th></th></tr></thead>
          <tbody>{rows.map((row) => {
            const id = String(row.id);
            return <tr key={id} className="border-t border-white/10">
              <td className="p-3"><div className="font-bold">{nameFor(row)}</div><div className="text-xs text-white/45">{String(row.address || "")} {String(row.city || "")}, {String(row.state || "")}</div></td>
              <td>{String(row.location_type || "—")}</td>
              <td>{String(row.status || "—")}</td>
              <td>{row.is_searchable === true ? "Searchable" : "Not searchable"}</td>
              <td>{row.is_claimed === true || row.claim_status === "approved" ? "Claimed" : "Unclaimed"}</td>
              <td className="pr-3 text-right"><Link href={`/admin/dashboard/locations/id/${id}`} className="rounded-lg border border-white/15 px-3 py-2 font-bold">Open</Link></td>
            </tr>;
          })}</tbody>
        </table>
        {!rows.length && <div className="p-10 text-center text-white/55">No locations match these filters.</div>}
      </div>

      <div className="flex justify-between">
        <Link aria-disabled={page <= 1} href={`?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}&page=${Math.max(1, page - 1)}`} className={`rounded-xl border border-white/15 px-4 py-2 font-bold ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}>Previous</Link>
        <span className="text-sm text-white/50">Page {page}</span>
        <Link aria-disabled={to + 1 >= total} href={`?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}&status=${encodeURIComponent(status)}&page=${page + 1}`} className={`rounded-xl border border-white/15 px-4 py-2 font-bold ${to + 1 >= total ? "pointer-events-none opacity-40" : ""}`}>Next</Link>
      </div>
    </div>
  </main>;
}
