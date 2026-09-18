import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { AdminReviewButtons } from "@/components/TeamToolsForms";

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

export default async function WorkSessionsPage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const adminDb = getAdminDatabaseClient();

  const { data = [] } = await adminDb
    .from("team_work_sessions")
    .select("*")
    .order("clock_in_at", { ascending: false })
    .limit(100);

  const sessionRows = data || [];
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
    <main className="px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-black">Work Sessions</h1>
        <p className="mt-2 text-sm font-bold text-white/55">
          Time-based sessions only. Clock-in/out does not show or capture
          GPS/location.
        </p>

        <div className="mt-6 overflow-x-auto rounded-[2rem] border border-white/10 bg-[#111]">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-white/[0.06] text-xs uppercase tracking-widest text-white/45">
              <tr>
                <th className="p-4">Member</th>
                <th>Type</th>
                <th>Clock in</th>
                <th>Clock out</th>
                <th>Minutes</th>
                <th>Status</th>
                <th>Review</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {sessionRows.map((session) => {
                const user = usersById.get(String(session.user_id));
                return (
                  <tr key={session.id}>
                    <td className="p-4 font-bold">
                      {user?.full_name || user?.email || session.user_id}
                    </td>
                    <td>
                      {labelize(session.work_type)}
                      <br />
                      <span className="text-xs text-white/40">
                        {labelize(session.team_type)}
                      </span>
                    </td>
                    <td>{formatDateTime(session.clock_in_at)}</td>
                    <td>{formatDateTime(session.clock_out_at)}</td>
                    <td>{formatMinutes(session.total_minutes)}</td>
                    <td>
                      {labelize(session.status)} /{" "}
                      {labelize(session.approval_status)}
                    </td>
                    <td>
                      <AdminReviewButtons sessionId={String(session.id)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
