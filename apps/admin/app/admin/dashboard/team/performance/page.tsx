import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

function formatMinutes(minutes: number | null | undefined) {
  const safe = Math.max(0, Number(minutes || 0));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}

type PerformanceRow = {
  id: string;
  minutes: number;
  visits: number;
  verified: number;
  social: number;
  replies: number;
  answered: number;
  complete: number;
  resolved: number;
  closed: number;
};

export default async function PerformancePage() {
  await requireAdminRole(["superadmin", "admin", "manager"]);
  const adminDb = getAdminDatabaseClient();

  const [
    { data: sessions = [] },
    { data: activities = [] },
    { data: visits = [] },
    { data: outreach = [] },
  ] = await Promise.all([
    adminDb
      .from("team_work_sessions")
      .select("*")
      .eq("approval_status", "approved")
      .limit(1000),
    adminDb.from("team_work_activities").select("*").limit(1000),
    adminDb.from("ambassador_site_visits").select("*").limit(1000),
    adminDb.from("ambassador_social_outreach").select("*").limit(1000),
  ]);

  const sessionRows = sessions || [];
  const activityRows = activities || [];
  const visitRows = visits || [];
  const outreachRows = outreach || [];

  const userIds = [
    ...sessionRows,
    ...activityRows,
    ...visitRows,
    ...outreachRows,
  ]
    .map((row) => String(row.user_id || "").trim())
    .filter(Boolean);

  const usersById = new Map<
    string,
    { email: string | null; full_name: string | null }
  >();

  if (userIds.length) {
    const uniqueIds = Array.from(new Set(userIds));
    const { data: authData } = await adminDb.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    for (const user of authData?.users || []) {
      if (!uniqueIds.includes(user.id)) continue;
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

  const byUser = new Map<string, PerformanceRow>();
  for (const id of userIds) {
    if (!byUser.has(id)) {
      byUser.set(id, {
        id,
        minutes: 0,
        visits: 0,
        verified: 0,
        social: 0,
        replies: 0,
        answered: 0,
        complete: 0,
        resolved: 0,
        closed: 0,
      });
    }
  }

  for (const session of sessionRows) {
    const row = byUser.get(String(session.user_id));
    if (row) row.minutes += Number(session.total_minutes || 0);
  }

  for (const visit of visitRows) {
    const row = byUser.get(String(visit.user_id));
    if (!row) continue;
    row.visits += 1;
    if (visit.location_verification_status === "verified") row.verified += 1;
  }

  for (const item of outreachRows) {
    const row = byUser.get(String(item.user_id));
    if (!row) continue;
    if (item.message_status === "sent") row.social += 1;
    if (item.reply_status && item.reply_status !== "no_reply") row.replies += 1;
  }

  for (const activity of activityRows) {
    const row = byUser.get(String(activity.user_id));
    if (!row) continue;
    if (activity.ticket_action === "answered") row.answered += 1;
    if (activity.ticket_action === "marked_complete") row.complete += 1;
    if (activity.ticket_action === "resolved") row.resolved += 1;
    if (activity.ticket_action === "closed") row.closed += 1;
  }

  return (
    <main className="px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-black">Performance</h1>
        <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from(byUser.values()).map((row) => {
            const user = usersById.get(row.id);
            return (
              <article
                key={row.id}
                className="rounded-3xl border border-white/10 bg-[#111] p-5"
              >
                <h2 className="font-black">
                  {user?.full_name || user?.email || row.id}
                </h2>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-white/45">Approved hours</dt>
                  <dd>{formatMinutes(row.minutes)}</dd>
                  <dt className="text-white/45">Site visits</dt>
                  <dd>{row.visits}</dd>
                  <dt className="text-white/45">Verified visits</dt>
                  <dd>{row.verified}</dd>
                  <dt className="text-white/45">Social messages</dt>
                  <dd>{row.social}</dd>
                  <dt className="text-white/45">Replies</dt>
                  <dd>{row.replies}</dd>
                  <dt className="text-white/45">Answered</dt>
                  <dd>{row.answered}</dd>
                  <dt className="text-white/45">Complete</dt>
                  <dd>{row.complete}</dd>
                  <dt className="text-white/45">Resolved/Closed</dt>
                  <dd>
                    {row.resolved}/{row.closed}
                  </dd>
                </dl>
              </article>
            );
          })}
        </div>
      </div>
    </main>
  );
}
