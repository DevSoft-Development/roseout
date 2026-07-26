import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import RecentCreateSearchesPanel from "./RecentCreateSearchesPanel";
import SearchHealthClient from "./SearchHealthClient";
import SearchQualityReviewPanel from "./SearchQualityReviewPanel";

export const metadata = {
  title: "Search Health – Admin",
  description: "Monitor all searches, technical failures, and search-quality issues.",
};

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ issue?: string }>;

export default async function SearchHealthPage({ searchParams }: { searchParams: SearchParams }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.searchHealth);
  const params = await searchParams;
  const issueId = typeof params.issue === "string" ? params.issue : null;
  const { data: selectedIssue } = issueId
    ? await supabaseAdmin
        .from("search_health_events")
        .select(
          "id,created_at,source,raw_query,event_type,event_label,severity,restaurant_count,activity_count,pair_count,no_results_reason,no_pairs_reason,timing_ms,speed_status,review_status,debug",
        )
        .eq("id", issueId)
        .maybeSingle()
    : { data: null };

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.14),transparent_30%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Admin Tools / System</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Search Health</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">
            All Searches is the default landing view. Healthy traffic comes from <code>search_events</code>; actionable issues remain in <code>search_health_events</code>.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="#all-searches" className="rounded-full border border-emerald-300/30 bg-emerald-500/10 px-4 py-2 text-xs font-black text-emerald-50">All Searches</a>
            <a href="#issue-workflow" className="rounded-full border border-amber-300/30 bg-amber-500/10 px-4 py-2 text-xs font-black text-amber-50">Issue Workflow</a>
            <a href="/admin/dashboard/ml" className="rounded-full border border-rose-300/40 bg-rose-600/20 px-4 py-2 text-xs font-black text-rose-50">View ML dashboard</a>
          </div>
        </section>

        <RecentCreateSearchesPanel />

        {selectedIssue ? (
          <section id="search-health-issue" className="scroll-mt-6 rounded-3xl border border-amber-300/25 bg-amber-500/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-100">Linked Search Health Issue</p>
                <h2 className="mt-1 text-2xl font-black">{selectedIssue.event_label || selectedIssue.event_type || "Search issue"}</h2>
                <p className="mt-2 text-sm text-white/70">{selectedIssue.raw_query || "Query unavailable"}</p>
              </div>
              <a href="/admin/dashboard/search-health#all-searches" className="rounded-full border border-white/15 px-4 py-2 text-xs font-black text-white/80">Close detail</a>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Severity", selectedIssue.severity],
                ["Review status", selectedIssue.review_status],
                ["Results", `${selectedIssue.restaurant_count ?? 0} restaurants · ${selectedIssue.activity_count ?? 0} activities · ${selectedIssue.pair_count ?? 0} pairs`],
                ["Performance", selectedIssue.timing_ms == null ? selectedIssue.speed_status : `${selectedIssue.timing_ms} ms · ${selectedIssue.speed_status ?? "unknown"}`],
                ["No results reason", selectedIssue.no_results_reason],
                ["No pairs reason", selectedIssue.no_pairs_reason],
                ["Source", selectedIssue.source],
                ["Created", new Date(selectedIssue.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.14em] text-white/45">{label}</p>
                  <p className="mt-1 break-words text-sm font-bold text-white/85">{value || "—"}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section id="issue-workflow" className="scroll-mt-6 space-y-5">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-200">Issue-only workflow</p>
            <h2 className="mt-1 text-2xl font-black">Search Health Issues</h2>
            <p className="mt-2 text-sm text-white/60">Review, classify, and resolve only actionable events from <code>search_health_events</code>.</p>
          </div>
          <SearchQualityReviewPanel />
          <SearchHealthClient />
        </section>
      </div>
    </main>
  );
}
