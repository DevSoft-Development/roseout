import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import { getCurrentBetaUserDashboardContext } from "@/lib/user-dashboard";
import {
  getCurrentWeekStart,
  getOrCreateWeeklyBetaSessionForTester,
  getOrCreateWeeklyBetaSessionForUser,
  weeklySessionToVirtualAssignment,
} from "@/lib/beta/weeklyTasks";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import BetaCommandCenter from "@/components/user/beta/BetaCommandCenter";

export const dynamic = "force-dynamic";

async function isWeeklyBetaTestAdmin(userId?: string | null) {
  if (!userId) return false;
  const { data } = await supabaseAdmin
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  return ["admin", "superadmin"].includes(String(data?.role || ""));
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const ctx = await getCurrentBetaUserDashboardContext();
  const sp = await searchParams;
  const testMode = sp.test === "1";
  const week = getCurrentWeekStart();

  if (!testMode && !ctx.isBeta) {
    return (
      <UserDashboardShell>
        <DashboardCard>Beta access required.</DashboardCard>
      </UserDashboardShell>
    );
  }

  if (!ctx.user?.id) {
    return (
      <UserDashboardShell isBeta={ctx.isBeta}>
        <DashboardCard>We could not find your user account. Please sign in again.</DashboardCard>
      </UserDashboardShell>
    );
  }

  let session = null;
  if (testMode) {
    const allowedToTest = ctx.isBeta || (await isWeeklyBetaTestAdmin(ctx.user.id));
    if (allowedToTest) {
      const result = await getOrCreateWeeklyBetaSessionForUser(ctx.user.id, true);
      session = result.session;
    } else {
      const { data } = await supabaseAdmin
        .from("beta_test_sessions")
        .select("*")
        .eq("user_id", ctx.user.id)
        .eq("week_start_date", week)
        .eq("test_mode", true)
        .maybeSingle();
      session = data;
      if (!session) {
        return (
          <UserDashboardShell>
            <DashboardCard>Create a test weekly session from Giveaway → Weekly Beta first.</DashboardCard>
          </UserDashboardShell>
        );
      }
    }
  } else {
    const result = await getOrCreateWeeklyBetaSessionForTester(ctx.beta.id);
    session = result.session;
  }

  return (
    <UserDashboardShell isBeta>
      <BetaCommandCenter
        assignments={session ? [weeklySessionToVirtualAssignment(session)] : []}
        weekStart={week}
        giveawayStatus={ctx.beta?.giveaway_status || null}
        feedbackCount={0}
        profileComplete
        testMode={testMode}
      />
    </UserDashboardShell>
  );
}
