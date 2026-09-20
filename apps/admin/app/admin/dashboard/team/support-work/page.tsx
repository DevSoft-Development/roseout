import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function labelize(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

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

export default async function SupportWorkAdmin() {
  await requireAdminRole(["superadmin", "admin", "experience_team", "viewer"]);
  const adminDb = getAdminDatabaseClient();

  const { data = [] } = await adminDb
    .from("team_work_activities")
    .select("*")
    .eq("activity_type", "support_ticket")
    .order("created_at", { ascending: false })
    .limit(100);

  const activityRows = data || [];
  const userIds = Array.from(
    new Set(
      activityRows
        .map((activity) => String(activity.user_id || "").trim())
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
        eyebrow="Team · Support Operations"
        title="Support Work"
        subtitle="Uses the existing ticket system as source of truth. Support tickets do not require GPS or proof pictures."
        badge={<AdminStatusBadge tone="green">{activityRows.length} activity records loaded</AdminStatusBadge>}
      />

        <div className="mt-6 overflow-x-auto rounded-[2rem] border border-white/10 bg-[#111]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[0.06] text-xs uppercase tracking-widest text-white/45">
              <tr>
                <th className="p-4">Ticket</th>
                <th>Team member</th>
                <th>Action</th>
                <th>Status before/after</th>
                <th>Time</th>
                <th>Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {activityRows.map((activity) => {
                const user = usersById.get(String(activity.user_id));
                return (
                  <tr key={activity.id}>
                    <td className="p-4 font-black">
                      <Link
                        href={`/admin/dashboard/support/${activity.source_id}`}
                        className="text-rose-200 hover:text-white"
                      >
                        {activity.ticket_number || activity.source_id}
                      </Link>
                    </td>
                    <td>
                      {user?.full_name || user?.email || activity.user_id}
                    </td>
                    <td>{labelize(activity.ticket_action || activity.status)}</td>
                    <td>
                      {labelize(activity.ticket_status_before)} →{" "}
                      {labelize(activity.ticket_status_after)}
                    </td>
                    <td>{formatMinutes(activity.minutes_spent)}</td>
                    <td>{formatDateTime(activity.started_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
    </AdminPageShell>
  );
}
