import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatMinutes(minutes: number | null | undefined) {
  const safe = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

export default async function PayrollAdmin() {
  await requireAdminRole(["superadmin", "admin"]);
  const adminDb = getAdminDatabaseClient();

  const [{ data: sessions = [] }, { data: batches = [] }] = await Promise.all([
    adminDb
      .from("team_work_sessions")
      .select("*, team_member_profiles(include_in_payroll,hourly_rate,team_type)")
      .eq("approval_status", "approved")
      .is("exported_at", null)
      .order("clock_in_at", { ascending: false })
      .limit(100),
    adminDb
      .from("team_payroll_batches")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const sessionRows = sessions || [];
  const batchRows = batches || [];
  const userIds = Array.from(
    new Set(
      sessionRows
        .map((session) => String(session.user_id || "").trim())
        .filter(Boolean),
    ),
  );
  const usersById = new Map<
    string,
    { email: string | null; full_name: string | null }
  >();

  if (userIds.length) {
    const { data: authData } = await adminDb.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    for (const user of authData?.users || []) {
      if (!userIds.includes(user.id)) continue;
      usersById.set(user.id, {
        email: user.email ?? null,
        full_name:
          typeof user.user_metadata?.full_name === "string"
            ? user.user_metadata.full_name
            : typeof user.user_metadata?.name === "string"
              ? user.user_metadata.name
              : null,
      });
    }
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Team · Payroll"
        title="Payroll Export"
        subtitle="Approved sessions for payroll-enabled profiles are exported by the existing payroll workflow."
        badge={<AdminStatusBadge tone={sessionRows.length ? "amber" : "green"}>{sessionRows.length ? `${sessionRows.length} sessions pending export` : "Payroll queue clear"}</AdminStatusBadge>}
      />

        <div className="mt-6 rounded-3xl border border-white/10 bg-[#111] p-5">
          <h2 className="text-xl font-black">Pending export preview</h2>
          <div className="mt-4 space-y-2">
            {sessionRows.map((session) => {
              const user = usersById.get(String(session.user_id));
              return (
                <div
                  key={session.id}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4"
                >
                  <p className="font-black">
                    {user?.full_name || user?.email || session.user_id}
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    {formatDateTime(session.clock_in_at)} ·{" "}
                    {formatMinutes(session.total_minutes)} · Payroll eligible
                    profile:{" "}
                    {session.team_member_profiles?.include_in_payroll
                      ? "Yes"
                      : "No"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <h2 className="mt-8 text-2xl font-black">Batch history</h2>
        <div className="mt-4 grid gap-3">
          {batchRows.map((batch) => (
            <div
              key={batch.id}
              className="rounded-2xl border border-white/10 bg-[#111] p-4"
            >
              <p className="font-black">
                {batch.pay_period_start} → {batch.pay_period_end}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {batch.total_team_members} members ·{" "}
                {batch.total_approved_hours} hours · $
                {batch.total_estimated_pay || 0}
              </p>
            </div>
          ))}
        </div>
    </AdminPageShell>
  );
}
