import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import SearchAnchorOperationsControls from "./SearchAnchorOperationsControls";

export const dynamic = "force-dynamic";

const ACTIVE_STATUSES = ["pending", "processing", "failed", "dead_letter"] as const;

function friendlyReason(value: string) {
  const labels: Record<string, string> = {
    anchor_missing_or_stale: "Anchor needs to be created or refreshed",
    location_created: "New location needs an anchor check",
    location_updated: "Location changed",
    location_deleted: "Source location was removed",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

export default async function SearchAnchorOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : "all";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const [queueResult, locationCount, anchorCount, linkedCount, curatedCount, recentRuns] = await Promise.all([
    supabaseAdmin
      .from("search_anchor_reconciliation_queue")
      .select("id, location_id, event_type, reason_code, status, priority, attempts, max_attempts, available_at, locked_at, locked_by, processed_at, last_error, created_at, updated_at")
      .order("updated_at", { ascending: false })
      .limit(10000),
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("source_type", "linked_location"),
    supabaseAdmin.from("search_anchors").select("id", { count: "exact", head: true }).eq("source_type", "curated"),
    supabaseAdmin
      .from("cron_job_runs")
      .select("id, job_key, status, started_at, completed_at, duration_ms, result, error_message")
      .eq("job_key", "search-anchor-reconciliation")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const allRows = queueResult.data ?? [];
  const activeRows = allRows.filter((row: any) => ACTIVE_STATUSES.includes(row.status));
  const pendingUnique = new Set(activeRows.filter((row: any) => row.status === "pending").map((row: any) => row.location_id)).size;
  const processingUnique = new Set(activeRows.filter((row: any) => row.status === "processing").map((row: any) => row.location_id)).size;
  const failedUnique = new Set(activeRows.filter((row: any) => row.status === "failed" || row.status === "dead_letter").map((row: any) => row.location_id)).size;
  const completedRows = allRows.filter((row: any) => row.status === "completed");
  const completedUnique = new Set(completedRows.map((row: any) => row.location_id)).size;

  let visibleRows = status === "all" ? activeRows : allRows.filter((row: any) => row.status === status);
  if (q) {
    const normalized = q.toLowerCase();
    visibleRows = visibleRows.filter((row: any) => String(row.location_id).toLowerCase().includes(normalized) || String(row.last_error || "").toLowerCase().includes(normalized));
  }
  visibleRows = visibleRows.slice(0, 100);

  const locationIds = Array.from(new Set(visibleRows.map((row: any) => row.location_id).filter(Boolean)));
  const { data: locationRows } = locationIds.length
    ? await supabaseAdmin.from("locations").select("id, name, city, state").in("id", locationIds)
    : { data: [] as any[] };
  const locationsById = new Map((locationRows ?? []).map((location: any) => [location.id, location]));

  const cards = [
    ["Locations waiting", pendingUnique, "Unique locations ready for processing"],
    ["Being processed", processingUnique, "Work currently in progress"],
    ["Needs attention", failedUnique, "Failed or stopped after repeated attempts"],
    ["Linked anchors", linkedCount.count ?? 0, "Anchors connected to your locations"],
    ["Curated places", curatedCount.count ?? 0, "Standalone places such as landmarks"],
  ];

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">Search anchors</p>
            <h1 className="mt-2 text-3xl font-bold">Anchor Health & Automation</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">See what needs work, process safe batches, resolve failures, and review recent automation. Historical job events are kept separate from location totals.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/search-anchors/sync-preview" className="rounded-xl bg-red-700 px-4 py-2 text-sm font-semibold">Create missing anchors</Link>
            <Link href="/admin/dashboard/search-anchors/curated-review" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold">Review curated places</Link>
            <Link href="/admin/dashboard/search-anchors" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold">Anchor directory</Link>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(([label, value, help]) => (
            <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
              <p className="text-xs text-zinc-500">{label}</p>
              <p className="mt-2 text-3xl font-semibold">{Number(value).toLocaleString()}</p>
              <p className="mt-2 text-xs text-zinc-600">{help}</p>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-lg font-semibold">Inventory overview</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-800 bg-black p-4"><p className="text-xs text-zinc-500">Total locations</p><p className="mt-2 text-2xl font-semibold">{Number(locationCount.count ?? 0).toLocaleString()}</p></div>
            <div className="rounded-xl border border-zinc-800 bg-black p-4"><p className="text-xs text-zinc-500">Total anchors</p><p className="mt-2 text-2xl font-semibold">{Number(anchorCount.count ?? 0).toLocaleString()}</p></div>
            <div className="rounded-xl border border-zinc-800 bg-black p-4"><p className="text-xs text-zinc-500">Locations processed historically</p><p className="mt-2 text-2xl font-semibold">{completedUnique.toLocaleString()}</p><p className="mt-1 text-xs text-zinc-600">Across {completedRows.length.toLocaleString()} completed job events</p></div>
          </div>
        </section>

        <SearchAnchorOperationsControls failedCount={activeRows.filter((row: any) => row.status === "failed").length} deadLetterCount={activeRows.filter((row: any) => row.status === "dead_letter").length} />

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Work queue</h2><p className="mt-1 text-sm text-zinc-500">Only active or problem work appears here by default.</p></div>
            <div className="flex gap-2 text-sm">
              <Link href="/admin/dashboard/search-anchors/operations" className="rounded-lg border border-zinc-700 px-3 py-2">Active work</Link>
              <Link href="/admin/dashboard/search-anchors/operations?status=completed" className="rounded-lg border border-zinc-700 px-3 py-2">Activity history</Link>
            </div>
          </div>

          <form className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input type="hidden" name="status" value={status} />
            <input name="q" defaultValue={q} placeholder="Search location ID or error" className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-black px-4 py-3 outline-none focus:border-red-700" />
            <button className="rounded-xl bg-red-700 px-5 py-3 font-semibold">Search</button>
          </form>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-[1000px] w-full text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase text-zinc-400"><tr>{["Location", "Why it is here", "Work status", "Attempts", "Last error", "Updated"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
              <tbody>
                {visibleRows.map((row: any) => {
                  const location = locationsById.get(row.location_id);
                  return <tr key={row.id} className="border-t border-zinc-900 align-top">
                    <td className="px-4 py-4"><p className="font-medium">{location?.name ?? row.location_id}</p><p className="mt-1 text-xs text-zinc-500">{location ? [location.city, location.state].filter(Boolean).join(", ") : row.location_id}</p></td>
                    <td className="px-4 py-4 text-zinc-300">{friendlyReason(row.reason_code)}</td>
                    <td className="px-4 py-4 capitalize">{row.status === "pending" ? "Waiting" : row.status === "processing" ? "In progress" : String(row.status).replaceAll("_", " ")}</td>
                    <td className="px-4 py-4">{row.attempts} / {row.max_attempts}</td>
                    <td className="max-w-md px-4 py-4 text-zinc-300"><p className="line-clamp-3">{row.last_error ?? "—"}</p></td>
                    <td className="px-4 py-4 text-zinc-400">{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>;
                })}
                {!visibleRows.length && <tr><td colSpan={6} className="px-6 py-12 text-center text-zinc-500">No matching work items.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-lg font-semibold">Recent automation</h2>
          <p className="mt-1 text-sm text-zinc-500">The scheduled reconciliation runs automatically each day. Manual processing uses the same protected workflow.</p>
          <div className="mt-4 space-y-3">
            {(recentRuns.data ?? []).map((run: any) => <article key={run.id} className="rounded-xl border border-zinc-800 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium capitalize">{run.status}</span><span className="text-zinc-500">{new Date(run.started_at).toLocaleString()}</span></div><p className="mt-2 text-zinc-400">Duration: {run.duration_ms ?? "—"} ms</p>{run.error_message && <p className="mt-2 text-red-300">{run.error_message}</p>}</article>)}
            {!recentRuns.data?.length && <p className="text-sm text-zinc-500">No tracked automation runs found.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
