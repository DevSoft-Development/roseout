import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireBetaAdmin, safeError } from "../_shared";

const OVERVIEW_FIELDS = "total_applications,new_applications,approved_applications,total_testers,active_testers,total_feedback,open_feedback,fixed_feedback,total_bugs,critical_bugs,open_bugs,avg_search_ms_24h,slow_searches_24h,failed_searches_24h,search_count_24h,custom_prompt_searches_24h,turnstile_failures_24h,reminder_emails_sent_week,reminder_emails_failed_week,testers_with_incomplete_weekly_tasks,testers_completed_5_of_5" as const;

export async function GET() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const { data, error } = await supabaseAdmin.from("admin_beta_overview").select(OVERVIEW_FIELDS).maybeSingle();
    if (error) throw error;
    return NextResponse.json({ success: true, overview: data || {} });
  } catch (error) {
    console.error("ADMIN_BETA_OVERVIEW", error);
    return safeError();
  }
}
