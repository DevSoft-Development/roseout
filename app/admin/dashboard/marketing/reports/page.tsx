import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getPlannerFunnelSnapshot } from "@/lib/admin/planner-funnel";
import type { MarketingReportType } from "@/lib/admin/marketing-report-engine";
import MarketingReportBuilder from "./MarketingReportBuilder";
import MarketingReportNavigator from "./MarketingReportNavigator";
import "./marketing-intelligence.css";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<MarketingReportType>([
  "overview", "website_traffic", "search_activity", "search_funnel", "locations", "neighborhoods", "cuisines", "activities", "occasions", "acquisition", "campaigns", "content", "email", "qr_postcards", "events_experiences", "geography",
]);

function formatNumber(value: number) {
  return Intl.NumberFormat("en-US").format(value || 0);
}

function formatRate(value: number, base: number) {
  if (!base) return "0%";
  return `${Math.round((value / base) * 100)}%`;
}

export default async function MarketingReportsPage({ searchParams }: { searchParams?: Promise<{ type?: string; autorun?: string }> }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const params = searchParams ? await searchParams : {};
  const initialType = VALID_TYPES.has(params.type as MarketingReportType) ? (params.type as MarketingReportType) : "overview";
  const autoRun = params.autorun === "1" || params.autorun === "true";

  const [savedResult, scheduleResult, planner] = await Promise.all([
    supabaseAdmin.from("marketing_saved_reports").select("id,name,description,report_type,date_range,comparison,breakdown,filters,created_at").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("marketing_report_schedules").select("id,name,recipients,cadence,day_of_week,day_of_month,send_hour,send_minute,next_run_at,last_status,is_active,created_at").order("created_at", { ascending: false }).limit(50),
    getPlannerFunnelSnapshot(30),
  ]);

  const plannerStarts = planner.funnel[0]?.value || 0;

  return (
    <main className="marketing-intelligence-theme admin-page space-y-6 p-4 sm:p-6">
      <MarketingReportNavigator autoRun={autoRun} />

      <section className="overflow-hidden rounded-[1.7rem] border border-white/10 bg-[radial-gradient(circle_at_top_right,rgba(225,6,42,.18),transparent_38%),linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.025))] p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-red-300/25 bg-red-500/10 text-lg" aria-hidden="true">↗</span>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-300/80">Planner + Booking · Last 30 Days</p>
                <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-white sm:text-2xl">Plan → Book Plan → Outing Ready</h2>
              </div>
            </div>

            <p className="mt-3 text-sm font-semibold leading-6 text-white/55">
              Track planning demand, the Book Plan decision, reservation activity, and how many outings become fully ready. Save for later stays separate from booking conversion.
            </p>

            <div className="mt-4 flex flex-wrap gap-2 text-xs font-bold text-white/50">
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Complete outings {formatNumber(planner.planTypes.outing)}</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Restaurant only {formatNumber(planner.planTypes.restaurant)}</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Activity only {formatNumber(planner.planTypes.activity)}</span>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">Saved for later {formatNumber(planner.savedForLater)}</span>
            </div>
          </div>

          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:min-w-[620px] xl:grid-cols-4">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Planner starts</p>
              <p className="mt-2 text-3xl font-black text-white">{formatNumber(plannerStarts)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Book Plan</p>
              <p className="mt-2 text-3xl font-black text-white">{formatNumber(planner.bookPlanStarted)}</p>
              <p className="mt-1 text-xs font-bold text-white/40">{formatRate(planner.bookPlanStarted, plannerStarts)} of starts</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Partial</p>
              <p className="mt-2 text-3xl font-black text-white">{formatNumber(planner.partiallyBooked)}</p>
            </div>
            <div className="rounded-2xl border border-red-300/25 bg-red-500/10 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-100/65">Outing ready</p>
              <p className="mt-2 text-3xl font-black text-white">{formatNumber(planner.outingReady)}</p>
              <p className="mt-1 text-xs font-bold text-red-100/55">{formatRate(planner.outingReady, planner.bookPlanStarted)} of Book Plan</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 border-t border-white/10 pt-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Booking actions</p><p className="mt-1 text-xl font-black text-white">{formatNumber(planner.bookingActionsStarted)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Post-visit confirmed</p><p className="mt-1 text-xl font-black text-white">{formatNumber(planner.postVisitConfirmed)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Outings reviewed</p><p className="mt-1 text-xl font-black text-white">{formatNumber(planner.reviewsSubmitted)}</p></div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold text-white/40">The detailed view shows each planning step, booking drop-off, confirmations, sharing, and review activity.</p>
          <Link
            href="/admin/dashboard/analytics/planner"
            className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-white shadow-lg shadow-red-950/25 transition hover:bg-[#ff173d]"
          >
            Open Full Funnel →
          </Link>
        </div>
      </section>

      <MarketingReportBuilder
        initialType={initialType}
        savedReports={(savedResult.data || []) as any}
        schedules={(scheduleResult.data || []) as any}
        adminEmail={admin.email || "admin@theouthaven.com"}
      />
    </main>
  );
}
