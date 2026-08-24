import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { MarketingReportType } from "@/lib/admin/marketing-report-engine";
import MarketingReportBuilder from "./MarketingReportBuilder";
import MarketingReportNavigator from "./MarketingReportNavigator";
import "./marketing-intelligence.css";

export const dynamic = "force-dynamic";

const VALID_TYPES = new Set<MarketingReportType>([
  "overview", "website_traffic", "search_activity", "search_funnel", "locations", "neighborhoods", "cuisines", "activities", "occasions", "acquisition", "campaigns", "content", "email", "qr_postcards", "events_experiences", "geography",
]);

export default async function MarketingReportsPage({ searchParams }: { searchParams?: Promise<{ type?: string; autorun?: string }> }) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const params = searchParams ? await searchParams : {};
  const initialType = VALID_TYPES.has(params.type as MarketingReportType) ? (params.type as MarketingReportType) : "overview";
  const autoRun = params.autorun === "1" || params.autorun === "true";

  const [savedResult, scheduleResult] = await Promise.all([
    supabaseAdmin.from("marketing_saved_reports").select("id,name,description,report_type,date_range,comparison,breakdown,filters,created_at").order("created_at", { ascending: false }).limit(50),
    supabaseAdmin.from("marketing_report_schedules").select("id,name,recipients,cadence,day_of_week,day_of_month,send_hour,send_minute,next_run_at,last_status,is_active,created_at").order("created_at", { ascending: false }).limit(50),
  ]);

  return (
    <main className="marketing-intelligence-theme admin-page space-y-6 p-4 sm:p-6">
      <MarketingReportNavigator autoRun={autoRun} />
      <MarketingReportBuilder
        initialType={initialType}
        savedReports={(savedResult.data || []) as any}
        schedules={(scheduleResult.data || []) as any}
        adminEmail={admin.email || "admin@theouthaven.com"}
      />
    </main>
  );
}
