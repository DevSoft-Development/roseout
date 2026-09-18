import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { TeamMemberProfileForm } from "@/components/TeamToolsForms";

export const dynamic = "force-dynamic";

function labelize(value: string | null | undefined) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function MembersPage() {
  await requireAdminRole(["superadmin"]);
  const adminDb = getAdminDatabaseClient();

  const [{ data: profiles = [] }, auth] = await Promise.all([
    adminDb
      .from("team_member_profiles")
      .select("*")
      .order("created_at", { ascending: false }),
    adminDb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const profileRows = profiles || [];
  const users = (auth.data?.users || []).map((user) => ({
    id: user.id,
    email: user.email ?? null,
    name:
      typeof user.user_metadata?.full_name === "string"
        ? user.user_metadata.full_name
        : typeof user.user_metadata?.name === "string"
          ? user.user_metadata.name
          : null,
  }));
  const userById = new Map(users.map((user) => [user.id, user]));

  return (
    <main className="px-4 py-6 text-white">
      <div className="mx-auto max-w-7xl">
        <h1 className="text-3xl font-black">Team Members</h1>
        <p className="mt-2 text-sm font-bold text-white/55">
          Profiles link to existing auth users; no second login is created.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <section className="rounded-[2rem] border border-white/10 bg-[#111] p-5">
            <h2 className="text-xl font-black">Current profiles</h2>
            <div className="mt-4 space-y-3">
              {profileRows.map((profile) => {
                const user = userById.get(profile.user_id);
                return (
                  <div
                    key={profile.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <p className="font-black">
                      {user?.name || user?.email || profile.user_id}
                    </p>
                    <p className="mt-1 text-xs font-bold text-white/45">
                      {labelize(profile.team_type)} · {labelize(profile.status)} · Payroll:{" "}
                      {profile.include_in_payroll ? "Yes" : "No"}
                    </p>
                    <p className="mt-2 text-xs text-white/40">
                      {profile.allowed_work_types?.length
                        ? profile.allowed_work_types.map(labelize).join(", ")
                        : "Using default work types for this team type."}
                    </p>
                  </div>
                );
              })}
              {profileRows.length === 0 ? (
                <p className="text-sm font-bold text-white/45">
                  No team profiles yet.
                </p>
              ) : null}
            </div>
          </section>

          <TeamMemberProfileForm users={users} />
        </div>
      </div>
    </main>
  );
}
