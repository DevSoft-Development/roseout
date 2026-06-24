import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import { getCurrentBetaUserDashboardContext } from "@/lib/user-dashboard";
import { getCurrentWeekStart, getOrCreateWeeklyBetaSessionForTester, weeklySessionToVirtualAssignment } from "@/lib/beta/weeklyTasks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import BetaCommandCenter from "@/components/user/beta/BetaCommandCenter";
export const dynamic="force-dynamic";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string>>}){const ctx=await getCurrentBetaUserDashboardContext(); if(!ctx.isBeta)return <UserDashboardShell><DashboardCard>Beta access required.</DashboardCard></UserDashboardShell>; const sp=await searchParams; const week=getCurrentWeekStart(); const testMode=sp.test==="1"; const session=testMode?(await supabaseAdmin.from("beta_test_sessions").select("*").eq("user_id",ctx.user?.id).eq("week_start_date",week).eq("test_mode",true).maybeSingle()).data:(await getOrCreateWeeklyBetaSessionForTester(ctx.beta.id)).session; return <UserDashboardShell isBeta><BetaCommandCenter assignments={session?[weeklySessionToVirtualAssignment(session)]:[]} weekStart={week} giveawayStatus={ctx.beta?.giveaway_status||null} feedbackCount={0} profileComplete testMode={testMode}/></UserDashboardShell>}
