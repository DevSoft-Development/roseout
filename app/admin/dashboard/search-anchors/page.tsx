import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function pct(success: number, total: number) {
  if (!total) return "—";
  return `${Math.round((success / total) * 100)}%`;
}

const tabs = [
  { label: "All Anchors", href: "/admin/dashboard/search-anchors" },
  { label: "Linked Locations", href: "/admin/dashboard/search-anchors?view=linked" },
  { label: "Curated Places", href: "/admin/dashboard/search-anchors?view=curated" },
  { label: "Dry Run & Approval", href: "/admin/dashboard/search-anchors/sync-preview" },
  { label: "Pending Discoveries", href: "/admin/dashboard/search-anchors?view=discoveries" },
  { label: "Issues", href: "/admin/dashboard/search-anchors/audit" },
  { label: "Analytics", href: "/admin/dashboard/search-anchors?view=analytics" },
];

export default async function SearchAnchorsAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const q = typeof params.q === "string" ? params.q : "";
  const view = typeof params.view === "string" ? params.view : "all";

  let query = supabaseAdmin
    .from("search_anchors")
    .select("*", { count: "exact" })
    .order("usage_count", { ascending: false })
    .limit(50);

  if (q) query = query.ilike("canonical_name", `%${q.replace(/[%,]/g, " ")}%`);
  if (view === "linked") query = query.not("linked_location_id", "is", null);
  if (view === "curated") query = query.eq("source_type", "curated");

  const [{ data: anchors, count }, active, approved, pending, discoveries, linked] = await Promise.all([
    query,
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("is_active", true),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("review_status", "approved"),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("review_status", "pending_review"),
    supabaseAdmin.from("search_anchor_discoveries").select("id", { count: "exact", head: true }).eq("status", "unresolved"),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).not("linked_location_id", "is", null),
  ]);

  const rows = anchors ?? [];
  const anchorSearches = rows.reduce((sum: number, row: any) => sum + Number(row.usage_count ?? 0), 0);
  const noResults = rows.reduce((sum: number, row: any) => sum + Number(row.no_result_count ?? 0), 0);
  const stats = [
    ["Active anchors", active.count ?? 0],
    ["Linked locations", linked.count ?? 0],
    ["Approved", approved.count ?? 0],
    ["Pending review", pending.count ?? 0],
    ["Discoveries", discoveries.count ?? 0],
    ["No-result rate", anchorSearches ? `${Math.round((noResults / anchorSearches) * 100)}%` : "—"],
  ];

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">Search / System tools</p>
            <h1 className="mt-2 text-3xl font-bold">Search Anchors</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Manage named locations, linked TheOutHaven places, discovery candidates, radius settings, and anchor health.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/search-anchors/sync-preview" className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold hover:bg-red-600">Dry Run & Approval</Link>
            <Link href="/admin/dashboard/search-anchors/audit" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-red-700">Run coverage audit</Link>
            <Link href="/admin/dashboard/search-anchors?view=linked" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold hover:border-red-700">View linked locations</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {stats.map(([label, value]) => (
            <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-2 text-2xl font-semibold text-red-100">{value}</p>
            </article>
          ))}
        </section>

        <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Search anchor sections">
          {tabs.map((tab) => {
            const activeTab = tab.label === "All Anchors" ? view === "all" : tab.href.includes(`view=${view}`);
            return (
              <Link key={tab.label} href={tab.href} className={`whitespace-nowrap rounded-full border px-4 py-2 text-sm transition ${activeTab ? "border-red-600 bg-red-950 text-white" : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-red-800 hover:text-white"}`}>
                {tab.label}
              </Link>
            );
          })}
        </nav>

        {view === "discoveries" ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold">Pending discoveries</h2>
            <p className="mt-2 text-sm text-zinc-400">There are {discoveries.count ?? 0} unresolved named-place candidates. The full review workflow is planned after the read-only coverage audit.</p>
          </section>
        ) : view === "analytics" ? (
          <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-6">
            <h2 className="text-lg font-semibold">Anchor analytics</h2>
            <p className="mt-2 text-sm text-zinc-400">Current loaded anchors account for {anchorSearches.toLocaleString()} searches with a {anchorSearches ? Math.round(((anchorSearches - noResults) / anchorSearches) * 100) : 0}% result success rate.</p>
          </section>
        ) : (
          <>
            <section className="rounded-2xl border border-red-900/60 bg-red-950/20 p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-300">Production rollout</p>
                  <h2 className="mt-1 text-lg font-semibold">Dry Run & Approval</h2>
                  <p className="mt-1 max-w-3xl text-sm text-zinc-300">Preview every proposed anchor change, review warnings, approve the plan, and execute bounded production batches.</p>
                </div>
                <Link href="/admin/dashboard/search-anchors/sync-preview" className="rounded-xl bg-red-700 px-5 py-3 text-center text-sm font-semibold hover:bg-red-600">Open Dry Run & Approval</Link>
              </div>
            </section>

            <form className="flex flex-col gap-3 sm:flex-row">
              {view !== "all" && <input type="hidden" name="view" value={view} />}
              <input name="q" defaultValue={q} placeholder="Search anchor name" className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white outline-none focus:border-red-700" />
              <button className="rounded-xl bg-red-700 px-5 py-3 font-semibold hover:bg-red-600">Search</button>
              {(q || view !== "all") && <Link href="/admin/dashboard/search-anchors" className="rounded-xl border border-zinc-700 px-5 py-3 text-center font-semibold text-zinc-300">Reset</Link>}
            </form>

            <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              <div className="overflow-x-auto">
                <table className="min-w-[900px] w-full text-left text-sm">
                  <thead className="bg-zinc-900 text-xs uppercase text-zinc-400">
                    <tr>{["Anchor", "Area", "Connection", "Radius", "Performance", "Health", "Status"].map((heading) => <th key={heading} className="whitespace-nowrap px-4 py-3">{heading}</th>)}</tr>
                  </thead>
                  <tbody>
                    {rows.map((anchor: any) => (
                      <tr key={anchor.id} className="border-t border-zinc-900 align-top hover:bg-zinc-900/40">
                        <td className="px-4 py-4">
                          <p className="font-medium text-white">{anchor.canonical_name}</p>
                          <p className="mt-1 text-xs text-zinc-500">{anchor.anchor_type} · {(anchor.aliases ?? []).length} aliases</p>
                        </td>
                        <td className="px-4 py-4 text-zinc-300"><p>{anchor.market ?? "Unassigned"}</p><p className="mt-1 text-xs text-zinc-500">{anchor.borough ?? anchor.county ?? anchor.city ?? "—"}</p></td>
                        <td className="px-4 py-4"><span className="rounded-full border border-zinc-700 px-2 py-1 text-xs">{anchor.linked_location_id ? "Linked location" : anchor.source_type}</span></td>
                        <td className="px-4 py-4 text-zinc-300">{anchor.default_radius_miles} mi<p className="mt-1 text-xs text-zinc-500">Max {anchor.max_radius_miles} mi</p></td>
                        <td className="px-4 py-4 text-zinc-300">{Number(anchor.usage_count ?? 0).toLocaleString()} searches<p className="mt-1 text-xs text-zinc-500">{pct(Number(anchor.successful_search_count), Number(anchor.usage_count))} success</p></td>
                        <td className="px-4 py-4"><span className="rounded-full border border-zinc-700 px-2 py-1 text-xs text-zinc-300">{anchor.sync_status ?? "current"}</span><p className="mt-2 text-xs text-zinc-500">{anchor.last_synced_at ? new Date(anchor.last_synced_at).toLocaleDateString() : "Never synced"}</p></td>
                        <td className="px-4 py-4"><p className={anchor.is_active ? "text-emerald-300" : "text-zinc-500"}>{anchor.is_active ? "Active" : "Disabled"}</p><p className="mt-1 text-xs capitalize text-zinc-500">{String(anchor.review_status ?? "unknown").replaceAll("_", " ")}</p></td>
                      </tr>
                    ))}
                    {!rows.length && <tr><td colSpan={7} className="px-6 py-12 text-center text-zinc-500">No anchors match this view.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <p className="text-sm text-zinc-500">Showing {rows.length} of {count ?? rows.length} matching anchors.</p>
          </>
        )}
      </div>
    </main>
  );
}
