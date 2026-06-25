import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getBetaGiveawayEligibilityForEmail } from "@/lib/beta-giveaway-eligibility";
import { getBetaAccountReadinessForEntries } from "@/lib/beta/accountReadiness";
import {
  getBetaApplications,
  getBetaBugReportsForAdmin,
  getBetaFeedbackForAdmin,
  getBetaGiveawayOverview,
  getWeeklyBetaSessionsForAdmin,
  getActiveBetaUsersForAdmin,
} from "@/lib/giveaway/betaProgram";
import GiveawayAdminClient from "./GiveawayAdminClient";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
} from "@/components/admin/AdminDesignSystem";

export const metadata = { title: "Giveaway" };

async function safeLoad<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await loader();
  } catch (error) {
    console.error("ADMIN_GIVEAWAY_LOAD_ERROR", label, error);
    return fallback;
  }
}

function GiveawayLoadError() {
  return (
    <div className="rounded-3xl border border-amber-300/30 bg-amber-500/10 p-6 text-amber-50">
      <h2 className="text-xl font-black">
        We couldn’t load the giveaway dashboard.
      </h2>
      <p className="mt-2 text-sm text-amber-50/80">
        Please try again, or check the server logs for details.
      </p>
    </div>
  );
}

async function loadGiveawayDashboardData() {
  try {
    const [entriesResult, duplicatesResult, applications, feedback, bugs, weeklySessions, overview, activeBetaUsers] =
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
        safeLoad("beta_applications", getBetaApplications, []),
        safeLoad("beta_feedback", getBetaFeedbackForAdmin, []),
        safeLoad("beta_bug_reports", getBetaBugReportsForAdmin, []),
        safeLoad("weekly_beta_sessions", getWeeklyBetaSessionsForAdmin, []),
        safeLoad("beta_giveaway_overview", async () => getBetaGiveawayOverview() as Promise<Record<string, number>>, {}),
        safeLoad("active_beta_users", getActiveBetaUsersForAdmin, []),
      ]);

    if (entriesResult.error)
      console.error(
        "ADMIN_GIVEAWAY_LOAD_ERROR",
        "launch_waitlist_signups",
        entriesResult.error,
      );
    if (duplicatesResult.error)
      console.error(
        "ADMIN_GIVEAWAY_LOAD_ERROR",
        "launch_waitlist_duplicate_events",
        duplicatesResult.error,
      );

    const baseEntries = entriesResult.data || [];
    const readinessList = await safeLoad(
      "beta_account_readiness",
      () => getBetaAccountReadinessForEntries(baseEntries),
      [] as any[],
    );
    const list = await Promise.all(
      baseEntries.map(async (entry, index) => ({
        ...entry,
        beta_account_readiness: readinessList[index] ?? null,
        beta_giveaway_eligibility: await safeLoad(
          `beta_giveaway_eligibility:${entry.email || entry.id}`,
          () => getBetaGiveawayEligibilityForEmail(entry.email || ""),
          null as any,
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
      verifiedEntries: list.filter((entry) => entry.giveaway_status === "verified")
        .length,
      missingSocialHandle: list.filter(
        (entry) => entry.wants_giveaway && !entry.social_handle,
      ).length,
      duplicateFlagged: list.filter((entry) => entry.duplicate_flag).length,
      winnerSelected: list.filter((entry) => entry.giveaway_status === "winner")
        .length,
    };
    return { ok: true as const, list, stats, duplicateEvents: duplicatesResult.data || [], applications, feedback, bugs, weeklySessions, overview, activeBetaUsers };
  } catch (error) {
    console.error("ADMIN_GIVEAWAY_LOAD_FATAL", error);
    return { ok: false as const };
  }
}

export default async function AdminGiveawayPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.giveaway);
  const loaded = await loadGiveawayDashboardData();

  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader
          eyebrow="TheOutHaven Admin · Beta Rewards"
          title="Giveaway"
          subtitle="Review beta giveaway eligibility, bonus entries, weekly progress, and prize readiness."
        />
        <GiveawayLoadError />
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="TheOutHaven Admin · Beta Rewards"
        title="Giveaway"
        subtitle="Review beta giveaway eligibility, optional bonus entries, weekly beta progress, and prize readiness."
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/giveaway" variant="primary">
              Refresh Giveaway Status
            </AdminActionButton>
            <AdminActionButton href="/admin/dashboard/giveaway#export">
              Export Review List
            </AdminActionButton>
          </>
        }
      />
      <GiveawayAdminClient
        initialEntries={loaded.list}
        initialStats={loaded.stats}
        duplicateEvents={loaded.duplicateEvents}
        initialApplications={loaded.applications || []}
        initialFeedback={loaded.feedback || []}
        initialBugReports={loaded.bugs || []}
        initialWeeklySessions={loaded.weeklySessions || []}
        initialOverview={loaded.overview}
        initialActiveBetaUsers={loaded.activeBetaUsers || []}
      />
    </AdminPageShell>
  );
}
