import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBetaGiveawayEligibilityForEmail } from "@/lib/beta-giveaway-eligibility";
import { getBetaAccountReadinessForEntries } from "@/lib/beta/accountReadiness";
import GiveawayAdminClient from "./GiveawayAdminClient";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminDesignSystem";

export const metadata = { title: "Beta Tester Reward Admin" };

export default async function AdminGiveawayPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.giveaway);
  const [{ data: entries }, { data: duplicateEvents }, { data: weeklyTasks }] =
    await Promise.all([
      supabaseAdmin
        .from("launch_waitlist_signups")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin
        .from("launch_waitlist_duplicate_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("beta_tasks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
  const baseEntries = entries || [];
  const readinessList = await getBetaAccountReadinessForEntries(baseEntries);
  const list = await Promise.all(
    baseEntries.map(async (entry, index) => ({
      ...entry,
      beta_account_readiness: readinessList[index],
      beta_giveaway_eligibility: await getBetaGiveawayEligibilityForEmail(
        entry.email || "",
      ),
    })),
  );
  const stats = {
    total: list.length,
    launchListOnly: list.filter((entry) => !entry.wants_giveaway).length,
    giveawayEntries: list.filter((entry) => entry.wants_giveaway).length,
    loginReady: list.filter((entry) => entry.beta_account_readiness?.loginReady)
      .length,
    needsSetup: list.filter(
      (entry) => entry.beta_account_readiness?.needsSetupEmail,
    ).length,
    pendingVerification: list.filter(
      (entry) => entry.giveaway_status === "pending_verification",
    ).length,
    verifiedEntries: list.filter(
      (entry) => entry.giveaway_status === "verified",
    ).length,
    missingSocialHandle: list.filter(
      (entry) => entry.wants_giveaway && !entry.social_handle,
    ).length,
    duplicateFlagged: list.filter((entry) => entry.duplicate_flag).length,
    winnerSelected: list.filter((entry) => entry.giveaway_status === "winner")
      .length,
  };

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="TheOutHaven Admin · Beta Rewards"
        title="Beta Prize Eligibility"
        subtitle="Manage Beta Reward entries, verify social and tagged-friends requirements, review beta task eligibility, and export program CSV data."
        actions={
          <AdminActionButton href="/admin/dashboard">
            Admin Dashboard
          </AdminActionButton>
        }
      />
      <GiveawayAdminClient
        initialEntries={list}
        initialStats={stats}
        duplicateEvents={duplicateEvents || []}
        initialWeeklyTasks={weeklyTasks || []}
      />
    </AdminPageShell>
  );
}
