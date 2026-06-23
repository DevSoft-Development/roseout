import Link from "next/link";
import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import { getCurrentBetaUserDashboardContext } from "@/lib/user-dashboard";
import { assignWeeklyBetaTasksForTester, getCurrentWeekStart } from "@/lib/beta/weeklyTasks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import BetaCommandCenter from "@/components/user/beta/BetaCommandCenter";

export const dynamic = "force-dynamic";

export default async function Page() {
  const ctx = await getCurrentBetaUserDashboardContext();
  if (!ctx.isBeta) {
    return <UserDashboardShell><DashboardCard><h1 className="text-3xl font-black">Beta access required</h1><p className="mt-2 text-white/60">This area is for active beta testers.</p><Link href="/user/dashboard" className="mt-5 inline-flex rounded-full bg-rose-600 px-5 py-3 text-sm font-black">Back to dashboard</Link></DashboardCard></UserDashboardShell>;
  }
  await assignWeeklyBetaTasksForTester(ctx.beta.id);
  const week = getCurrentWeekStart();
  const [{ data: assignments }, { count: feedbackCount }] = await Promise.all([
    supabaseAdmin.from("beta_task_assignments").select("*, beta_tasks(*)").eq("tester_id", ctx.beta.id).eq("assigned_week_start", week).order("created_at", { ascending: true }),
    supabaseAdmin.from("beta_feedback").select("id", { count: "exact", head: true }).eq("tester_id", ctx.beta.id).gte("created_at", `${week}T00:00:00.000Z`),
  ]);
  const profileComplete = Boolean(ctx.profile?.zip_code && ctx.profile?.preferences && Object.keys(ctx.profile?.preferences || {}).length > 0);
  return <UserDashboardShell isBeta><BetaCommandCenter assignments={assignments || []} weekStart={week} giveawayStatus={ctx.beta?.giveaway_status || ctx.beta?.weekly_task_eligibility_status || null} feedbackCount={feedbackCount || 0} profileComplete={profileComplete}/></UserDashboardShell>;
}
