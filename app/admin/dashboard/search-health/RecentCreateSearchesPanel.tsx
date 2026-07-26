import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type SearchEventRow = {
  id: string;
  created_at: string;
  raw_query: string | null;
  normalized_query: string | null;
  restaurant_count: number | null;
  activity_count: number | null;
  pair_count: number | null;
  result_count: number | null;
  timing_ms: number | null;
  speed_status: string | null;
  success: boolean | null;
  had_issue: boolean | null;
  issue_label: string | null;
};

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function RecentCreateSearchesPanel() {
  const { data, error } = await supabaseAdmin
    .from("search_events")
    .select(
      "id,created_at,raw_query,normalized_query,restaurant_count,activity_count,pair_count,result_count,timing_ms,speed_status,success,had_issue,issue_label",
    )
    .eq("source", "public_create_search")
    .order("created_at", { ascending: false })
    .limit(25);

  const rows = (data ?? []) as SearchEventRow[];

  return (
    <section className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-rose-200">
            Live /create traffic
          </p>
          <h2 className="mt-1 text-2xl font-black">Recent Create Searches</h2>
          <p className="mt-2 text-sm text-white/60">
            Every completed search from <code>/create</code>, including healthy searches that do not create an issue.
          </p>
        </div>
        <a
          href="/admin/dashboard/search-health"
          className="rounded-full border border-white/15 bg-white/[.06] px-4 py-2 text-xs font-black text-white/80"
        >
          Refresh
        </a>
      </div>

      {error ? (
        <p className="mt-4 rounded-2xl border border-red-300/25 bg-red-500/10 p-4 text-sm font-semibold text-red-100">
          Recent searches could not be loaded: {error.message}
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-semibold text-amber-100">
          No <code>public_create_search</code> rows were found. Check the <code>search_events</code> insert logs for <code>[search-events] insert failed</code>.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-black/30 text-xs uppercase tracking-[0.14em] text-white/45">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Query</th>
                <th className="px-4 py-3">Restaurants</th>
                <th className="px-4 py-3">Activities</th>
                <th className="px-4 py-3">Pairs</th>
                <th className="px-4 py-3">Results</th>
                <th className="px-4 py-3">Timing</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((row) => (
                <tr key={row.id} className="bg-black/10 align-top">
                  <td className="whitespace-nowrap px-4 py-3 text-white/55">
                    {formatTime(row.created_at)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-black text-white/90">{row.raw_query || "—"}</p>
                    {row.normalized_query && row.normalized_query !== row.raw_query ? (
                      <p className="mt-1 text-xs text-white/45">{row.normalized_query}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-bold">{row.restaurant_count ?? 0}</td>
                  <td className="px-4 py-3 font-bold">{row.activity_count ?? 0}</td>
                  <td className="px-4 py-3 font-bold">{row.pair_count ?? 0}</td>
                  <td className="px-4 py-3 font-bold">{row.result_count ?? 0}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-white/65">
                    {row.timing_ms == null ? "—" : `${row.timing_ms} ms`}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-black ${
                        row.success === false || row.had_issue
                          ? "border-amber-300/25 bg-amber-500/10 text-amber-100"
                          : "border-emerald-300/25 bg-emerald-500/10 text-emerald-100"
                      }`}
                    >
                      {row.success === false
                        ? "Failed"
                        : row.had_issue
                          ? row.issue_label || "Issue"
                          : row.speed_status || "Healthy"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
