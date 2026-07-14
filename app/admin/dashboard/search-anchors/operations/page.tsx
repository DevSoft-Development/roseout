import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-admin";
import SearchAnchorOperationsControls from "./SearchAnchorOperationsControls";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "processing", "completed", "failed", "dead_letter"] as const;

export default async function SearchAnchorOperationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const status = typeof params.status === "string" ? params.status : "all";
  const q = typeof params.q === "string" ? params.q.trim() : "";

  const countResults = await Promise.all(
    STATUSES.map((value) =>
      supabaseAdmin
        .from("search_anchor_reconciliation_queue")
        .select("id", { count: "exact", head: true })
        .eq("status", value),
    ),
  );

  let queueQuery = supabaseAdmin
    .from("search_anchor_reconciliation_queue")
    .select("id, location_id, event_type, reason_code, status, priority, attempts, max_attempts, available_at, locked_at, locked_by, last_error, created_at, updated_at, locations(name, city, state)")
    .order("updated_at", { ascending: false })
    .limit(100);

  if (status !== "all" && STATUSES.includes(status as any)) queueQuery = queueQuery.eq("status", status);
  if (q) queueQuery = queueQuery.or(`location_id.eq.${q},last_error.ilike.%${q.replace(/[%,]/g, " ")}%`);

  const [{ data: rows, error }, recentRuns] = await Promise.all([
    queueQuery,
    supabaseAdmin
      .from("cron_job_runs")
      .select("id, job_key, status, started_at, completed_at, duration_ms, result, error_message")
      .eq("job_key", "search-anchor-reconciliation")
      .order("started_at", { ascending: false })
      .limit(10),
  ]);

  const counts = Object.fromEntries(STATUSES.map((value, index) => [value, countResults[index].count ?? 0]));
  const problemCount = Number(counts.failed) + Number(counts.dead_letter);

  return (
    <main className="min-h-screen bg-black px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-400">Search anchors / Phase 5</p>
            <h1 className="mt-2 text-3xl font-bold">Reconciliation Operations</h1>
            <p className="mt-2 max-w-3xl text-sm text-zinc-400">Monitor queue health, review failures, retry recoverable work, and run bounded reconciliation batches.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/dashboard/search-anchors" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold">Back to anchors</Link>
            <Link href="/admin/dashboard/search-anchors/audit" className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold">Coverage audit</Link>
          </div>
        </header>

        {problemCount > 0 && (
          <section className="rounded-2xl border border-amber-700/70 bg-amber-950/20 p-4 text-sm text-amber-100">
            Attention required: {counts.failed} failed and {counts.dead_letter} dead-letter reconciliation items.
          </section>
        )}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {STATUSES.map((value) => (
            <Link key={value} href={`/admin/dashboard/search-anchors/operations?status=${value}`} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 hover:border-red-800">
              <p className="text-xs capitalize text-zinc-500">{value.replaceAll("_", " ")}</p>
              <p className="mt-2 text-2xl font-semibold">{counts[value]}</p>
            </Link>
          ))}
        </section>

        <SearchAnchorOperationsControls failedCount={Number(counts.failed)} deadLetterCount={Number(counts.dead_letter)} />

        <form className="flex flex-col gap-3 sm:flex-row">
          <input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} placeholder="Search location UUID or error" className="min-w-0 flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 outline-none focus:border-red-700" />
          <button className="rounded-xl bg-red-700 px-5 py-3 font-semibold hover:bg-red-600">Search</button>
          <Link href="/admin/dashboard/search-anchors/operations" className="rounded-xl border border-zinc-700 px-5 py-3 text-center font-semibold text-zinc-300">Reset</Link>
        </form>

        <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full text-left text-sm">
              <thead className="bg-zinc-900 text-xs uppercase text-zinc-400"><tr>{["Location", "Event", "Status", "Attempts", "Available", "Last error", "Updated"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}</tr></thead>
              <tbody>
                {(rows ?? []).map((row: any) => {
                  const location = Array.isArray(row.locations) ? row.locations[0] : row.locations;
                  return <tr key={row.id} className="border-t border-zinc-900 align-top">
                    <td className="px-4 py-4"><p className="font-medium">{location?.name ?? row.location_id}</p><p className="mt-1 text-xs text-zinc-500">{location ? [location.city, location.state].filter(Boolean).join(", ") : row.location_id}</p></td>
                    <td className="px-4 py-4"><p>{row.event_type}</p><p className="mt-1 text-xs text-zinc-500">{row.reason_code}</p></td>
                    <td className="px-4 py-4 capitalize">{String(row.status).replaceAll("_", " ")}</td>
                    <td className="px-4 py-4">{row.attempts} / {row.max_attempts}</td>
                    <td className="px-4 py-4 text-zinc-400">{row.available_at ? new Date(row.available_at).toLocaleString() : "—"}</td>
                    <td className="max-w-md px-4 py-4 text-zinc-300"><p className="line-clamp-3">{row.last_error ?? "—"}</p></td>
                    <td className="px-4 py-4 text-zinc-400">{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>;
                })}
                {!rows?.length && <tr><td colSpan={7} className="px-6 py-12 text-center text-zinc-500">{error ? error.message : "No queue items match this view."}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5">
          <h2 className="text-lg font-semibold">Recent cron runs</h2>
          <div className="mt-4 space-y-3">
            {(recentRuns.data ?? []).map((run: any) => <article key={run.id} className="rounded-xl border border-zinc-800 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium capitalize">{run.status}</span><span className="text-zinc-500">{new Date(run.started_at).toLocaleString()}</span></div><p className="mt-2 text-zinc-400">Duration: {run.duration_ms ?? "—"} ms</p>{run.error_message && <p className="mt-2 text-red-300">{run.error_message}</p>}</article>)}
            {!recentRuns.data?.length && <p className="text-sm text-zinc-500">No tracked reconciliation runs found.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
