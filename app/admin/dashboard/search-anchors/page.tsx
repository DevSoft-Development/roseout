import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function pct(success: number, total: number) {
  if (!total) return "—";
  return `${Math.round((success / total) * 100)}%`;
}

export default async function SearchAnchorsAdminPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) ?? {};
  const q = typeof params.q === "string" ? params.q : "";
  let query = supabaseAdmin.from("search_anchors").select("*", { count: "exact" }).order("usage_count", { ascending: false }).limit(50);
  if (q) query = query.ilike("canonical_name", `%${q.replace(/[%,]/g, " ")}%`);
  const [{ data: anchors, count }, active, approved, pending, discoveries] = await Promise.all([
    query,
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("review_status", "pending_review"),
    supabaseAdmin.from("search_anchor_discoveries").select("id", { count: "exact", head: true }).eq("status", "unresolved"),
  ]);
  const rows = anchors ?? [];
  const anchorSearches = rows.reduce((sum: number, row: any) => sum + Number(row.usage_count ?? 0), 0);
  const noResults = rows.reduce((sum: number, row: any) => sum + Number(row.no_result_count ?? 0), 0);
  const stats = [
    ["Total active anchors", active.count ?? 0], ["Approved anchors", approved.count ?? 0], ["Pending review", pending.count ?? 0], ["Unresolved candidates", discoveries.count ?? 0], ["Searches using anchors", anchorSearches], ["No-result rate", anchorSearches ? `${Math.round((noResults / anchorSearches) * 100)}%` : "—"],
  ];
  return <main className="min-h-screen bg-black p-8 text-white"><div className="mx-auto max-w-7xl space-y-8"><header><p className="text-sm uppercase tracking-[0.3em] text-red-400">Search / System tools</p><h1 className="text-3xl font-bold">Search Anchors</h1><p className="text-zinc-400">Manage named-location anchors, discovery candidates, radius policies, and linked-location sync.</p></header><section className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">{stats.map(([label,value])=><div key={label} className="rounded-2xl border border-red-900/50 bg-zinc-950 p-4"><p className="text-xs text-zinc-500">{label}</p><p className="mt-2 text-2xl font-semibold text-red-100">{value}</p></div>)}</section><form className="flex gap-3"><input name="q" defaultValue={q} placeholder="Search anchors" className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white"/><button className="rounded-xl bg-red-700 px-5 py-3 font-semibold">Filter</button></form><section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"><table className="w-full min-w-[1200px] text-left text-sm"><thead className="bg-zinc-900 text-xs uppercase text-zinc-400"><tr>{["Name","Aliases","Type","Market","Borough/County","Radius strategy","Default","Max","Source","Review","Usage","Success","Last resolved","Status","Actions"].map(h=><th key={h} className="px-4 py-3">{h}</th>)}</tr></thead><tbody>{rows.map((a:any)=><tr key={a.id} className="border-t border-zinc-900"><td className="px-4 py-3 font-medium">{a.canonical_name}<div className="text-xs text-zinc-500">{Number(a.latitude).toFixed(4)}, {Number(a.longitude).toFixed(4)}</div></td><td className="px-4 py-3 text-zinc-300">{(a.aliases??[]).join(", ") || "—"}</td><td className="px-4 py-3">{a.anchor_type}</td><td className="px-4 py-3">{a.market ?? "—"}</td><td className="px-4 py-3">{a.borough ?? a.county ?? "—"}</td><td className="px-4 py-3">{a.radius_strategy}</td><td className="px-4 py-3">{a.default_radius_miles}</td><td className="px-4 py-3">{a.max_radius_miles}</td><td className="px-4 py-3">{a.source_type}</td><td className="px-4 py-3">{a.review_status}</td><td className="px-4 py-3">{a.usage_count}</td><td className="px-4 py-3">{pct(Number(a.successful_search_count), Number(a.usage_count))}</td><td className="px-4 py-3">{a.last_resolved_at ? new Date(a.last_resolved_at).toLocaleString() : "—"}</td><td className="px-4 py-3">{a.is_active ? "active" : "disabled"}</td><td className="px-4 py-3 text-red-300">view · edit · approve · disable · merge · test · map</td></tr>)}</tbody></table></section><p className="text-sm text-zinc-500">Showing {rows.length} of {count ?? rows.length}. Admin API supports create, edit, approve, disable, merge, delete, test search, and linked-location sync.</p></div></main>;
}
