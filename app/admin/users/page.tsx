import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient, type User } from "@supabase/supabase-js";
import { getCurrentAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string;
  role?: string;
};

type UserProfile = {
  id: string;
  email: string | null;
  full_name?: string | null;
  phone?: string | null;
  role: string | null;
  subscription_status?: string | null;
  is_superadmin?: boolean | null;
  created_at: string | null;
};

type AppUser = UserProfile & {
  auth_email?: string | null;
  last_sign_in_at?: string | null;
};

const editableRoles = [
  "user",
  "owner",
  "viewer",
  "editor",
  "reviewer",
  "admin",
  "superuser",
  "disabled",
];

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

function formatNumber(value: number | null | undefined) {
  return Number(value || 0).toLocaleString();
}

function formatDate(value: string | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalizeRole(role?: string | null) {
  return String(role || "user").toLowerCase();
}

function isSuperuser(user: Pick<AppUser, "role" | "is_superadmin">) {
  const role = normalizeRole(user.role);
  return Boolean(user.is_superadmin) || role === "superuser" || role === "superadmin";
}

function displayRole(user: Pick<AppUser, "role" | "is_superadmin">) {
  if (user.is_superadmin) return "superuser";
  const role = normalizeRole(user.role);
  return role === "superadmin" ? "superuser" : role;
}

function roleBadge(role?: string | null, isSuperadmin?: boolean | null) {
  const normalized = normalizeRole(role);
  if (isSuperadmin || normalized === "superuser" || normalized === "superadmin") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (normalized === "admin") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalized === "owner") return "border-black/10 bg-[#f5eee8] text-black/70";
  if (normalized === "disabled") return "border-red-200 bg-red-50 text-red-700";
  if (normalized === "user") return "border-black/10 bg-white text-black/55";

  return "border-black/10 bg-neutral-100 text-black/50";
}

function canManageUser(currentRole: string, target: AppUser) {
  if (currentRole === "superuser") return true;
  if (currentRole === "admin") return !isSuperuser(target);
  return false;
}

function canAssignRole(currentRole: string, role: string) {
  if (currentRole === "superuser") return editableRoles.includes(role);
  return editableRoles.includes(role) && role !== "superuser";
}

async function listAuthUsers() {
  const authUsers: User[] = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) throw error;

    authUsers.push(...data.users);

    if (data.users.length < perPage) break;
    page += 1;
  }

  return authUsers;
}

async function getVisibleUsers(currentRole: string) {
  const [{ data: profiles, error: profilesError }, authUsers] = await Promise.all([
    supabaseAdmin.from("users").select("*"),
    listAuthUsers(),
  ]);

  if (profilesError) throw profilesError;

  const profileMap = new Map(
    ((profiles || []) as UserProfile[]).map((profile) => [profile.id, profile])
  );

  const merged: AppUser[] = authUsers.map((authUser) => {
    const metadataRole = normalizeRole(authUser.user_metadata?.role as string | undefined);
    const profile = profileMap.get(authUser.id);
    const role = profile?.role || metadataRole || "user";

    return {
      id: authUser.id,
      email: profile?.email || authUser.email || null,
      auth_email: authUser.email || null,
      full_name:
        profile?.full_name ||
        (authUser.user_metadata?.full_name as string | undefined) ||
        (authUser.user_metadata?.name as string | undefined) ||
        null,
      phone: profile?.phone || (authUser.user_metadata?.phone as string | undefined) || null,
      role,
      subscription_status: profile?.subscription_status || null,
      is_superadmin:
        profile?.is_superadmin ||
        Boolean(authUser.user_metadata?.is_superadmin || authUser.app_metadata?.is_superadmin),
      created_at: profile?.created_at || authUser.created_at || null,
      last_sign_in_at: authUser.last_sign_in_at || null,
    } satisfies AppUser;
  });

  for (const profile of (profiles || []) as UserProfile[]) {
    if (!merged.some((user) => user.id === profile.id)) {
      merged.push(profile as AppUser);
    }
  }

  return currentRole === "superuser"
    ? merged
    : merged.filter((user) => !isSuperuser(user));
}

async function updateUserRole(formData: FormData) {
  "use server";

  const currentAdmin = await getCurrentAdmin();
  const userId = String(formData.get("user_id") || "");
  const role = String(formData.get("role") || "user");
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect("/admin/users");

  const { data: targetProfile } = await supabaseAdmin
    .from("users")
    .select("id, role, is_superadmin")
    .eq("id", userId)
    .maybeSingle();

  const { data: targetAuth } = await supabaseAdmin.auth.admin.getUserById(userId);
  const target: AppUser = {
    id: userId,
    email: targetAuth.user?.email || null,
    role:
      targetProfile?.role ||
      (targetAuth.user?.user_metadata?.role as string | undefined) ||
      "user",
    is_superadmin:
      targetProfile?.is_superadmin ||
      Boolean(
        targetAuth.user?.user_metadata?.is_superadmin ||
          targetAuth.user?.app_metadata?.is_superadmin
      ),
    created_at: targetAuth.user?.created_at || null,
  };

  if (!canManageUser(currentAdmin.role, target) || !canAssignRole(currentAdmin.role, role)) {
    redirect("/admin/unauthorized");
  }

  const isSuperadmin = role === "superuser";

  await supabaseAdmin
    .from("users")
    .upsert(
      {
        id: userId,
        email: target.email,
        role,
        is_superadmin: isSuperadmin,
      },
      { onConflict: "id" }
    );

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      ...(targetAuth.user?.user_metadata || {}),
      role,
      is_superadmin: isSuperadmin,
    },
  });

  redirect(
    `/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(currentRole)}`
  );
}

async function disableUser(formData: FormData) {
  "use server";

  const currentAdmin = await getCurrentAdmin();
  const userId = String(formData.get("user_id") || "");
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect("/admin/users");

  const { data: targetAuth } = await supabaseAdmin.auth.admin.getUserById(userId);
  const target: AppUser = {
    id: userId,
    email: targetAuth.user?.email || null,
    role: (targetAuth.user?.user_metadata?.role as string | undefined) || "user",
    is_superadmin: Boolean(
      targetAuth.user?.user_metadata?.is_superadmin || targetAuth.user?.app_metadata?.is_superadmin
    ),
    created_at: targetAuth.user?.created_at || null,
  };

  if (!canManageUser(currentAdmin.role, target)) redirect("/admin/unauthorized");

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
    user_metadata: {
      ...(targetAuth.user?.user_metadata || {}),
      role: "disabled",
      disabled: true,
      is_superadmin: false,
    },
  });

  await supabaseAdmin
    .from("users")
    .update({ role: "disabled", is_superadmin: false })
    .eq("id", userId);

  redirect(
    `/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(currentRole)}`
  );
}

async function deleteUser(formData: FormData) {
  "use server";

  const currentAdmin = await getCurrentAdmin();
  const userId = String(formData.get("user_id") || "");
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect("/admin/users");

  const { data: targetAuth } = await supabaseAdmin.auth.admin.getUserById(userId);
  const target: AppUser = {
    id: userId,
    email: targetAuth.user?.email || null,
    role: (targetAuth.user?.user_metadata?.role as string | undefined) || "user",
    is_superadmin: Boolean(
      targetAuth.user?.user_metadata?.is_superadmin || targetAuth.user?.app_metadata?.is_superadmin
    ),
    created_at: targetAuth.user?.created_at || null,
  };

  if (!canManageUser(currentAdmin.role, target)) redirect("/admin/unauthorized");

  await supabaseAdmin.from("users").delete().eq("id", userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);

  redirect(
    `/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(currentRole)}`
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const currentAdmin = await getCurrentAdmin();

  if (!["superuser", "admin"].includes(currentAdmin.role)) {
    redirect("/admin/unauthorized");
  }

  const params = await searchParams;
  const q = params.q || "";
  const selectedRole = params.role || "all";

  let allVisibleUsers: AppUser[] = [];
  let errorMessage = "";

  try {
    allVisibleUsers = await getVisibleUsers(currentAdmin.role);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Unable to load users.";
  }

  const normalizedQuery = q.toLowerCase().trim();
  const filteredUsers = allVisibleUsers.filter((user) => {
    const role = displayRole(user);
    const matchesRole = selectedRole === "all" || role === selectedRole;
    const matchesQuery =
      !normalizedQuery ||
      [user.email, user.full_name, user.phone, role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);

    return matchesRole && matchesQuery;
  });

  const safeUsers = filteredUsers.sort((a, b) => {
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  });

  const totalUsers = allVisibleUsers.length;
  const admins = allVisibleUsers.filter((u) => ["admin", "superuser"].includes(displayRole(u))).length;
  const owners = allVisibleUsers.filter((u) => displayRole(u) === "owner").length;
  const regularUsers = allVisibleUsers.filter((u) => displayRole(u) === "user").length;
  const roleOptions = currentAdmin.role === "superuser" ? editableRoles : editableRoles.filter((role) => role !== "superuser");

  if (errorMessage) {
    return (
      <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white">
        <div className="mx-auto max-w-[1500px]">
          <div className="rounded-[1.75rem] border border-rose-500/30 bg-rose-500/10 p-6">
            <p className="text-sm font-black">Database Error</p>
            <p className="mt-2 text-sm">{errorMessage}</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white">
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-6 shadow-2xl">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                Roseout Admin
              </p>

              <h1 className="mt-2 text-4xl font-black">Users</h1>

              <p className="mt-2 text-sm text-white/60">
                {currentAdmin.role === "superuser"
                  ? "Superusers can view and manage every account, including superusers."
                  : "Admins can view and manage every account below superuser."}
              </p>
            </div>

            <Link
              href="/admin/users/new"
              className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg hover:scale-[1.03]"
            >
              + Create User
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <Stat title="Visible Users" value={formatNumber(totalUsers)} />
          <Stat title="Admins" value={formatNumber(admins)} />
          <Stat title="Owners" value={formatNumber(owners)} />
          <Stat title="Customers" value={formatNumber(regularUsers)} />
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          <form className="grid gap-3 md:grid-cols-[1fr_220px_140px]">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search by name, email, phone, or role..."
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300"
            />

            <select
              name="role"
              defaultValue={selectedRole}
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-bold text-white outline-none focus:border-rose-300"
            >
              <option className="text-black" value="all">All Roles</option>
              {roleOptions.map((role) => (
                <option key={role} className="text-black" value={role}>
                  {role}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="h-11 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 text-sm font-black text-white shadow-lg transition hover:scale-[1.02]"
            >
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {["all", ...roleOptions].map((role) => (
              <Link
                key={role}
                href={`/admin/users?q=${encodeURIComponent(q)}&role=${role}`}
                className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide transition ${
                  selectedRole === role
                    ? "border-rose-400 bg-rose-500 text-white"
                    : "border-white/10 bg-white/[0.06] text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {role}
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#f8f3ef] text-[#1b1210] shadow-2xl">
          <div className="flex flex-col gap-3 border-b border-black/10 bg-[#fffaf6] p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black">User Accounts</h2>
              <p className="mt-1 text-xs font-medium text-black/50">
                Showing {formatNumber(safeUsers.length)} matching users.
              </p>
            </div>

            <Link href="/admin/users/new" className="rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white">
              + Add User
            </Link>
          </div>

          {!safeUsers.length ? (
            <div className="p-10 text-center">
              <p className="text-lg font-black">No users found</p>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {safeUsers.map((user) => {
                const role = displayRole(user);
                const canManage = canManageUser(currentAdmin.role, user);

                return (
                  <div key={user.id} className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm transition hover:shadow-xl">
                    <div className="grid gap-4 xl:grid-cols-[1fr_300px_370px] xl:items-center">
                      <div>
                        <Link href={`/admin/users/${user.id}`} className="truncate font-black hover:text-rose-700">
                          {user.full_name || user.email || "No name"}
                        </Link>

                        <p className="mt-1 truncate text-sm font-bold text-black/55">
                          {user.email || user.auth_email || "No email"}
                        </p>

                        <p className="mt-1 text-xs text-black/40">
                          Created {formatDate(user.created_at)}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${roleBadge(user.role, user.is_superadmin)}`}>
                            {role}
                          </span>

                          <span className="rounded-full border border-black/10 bg-[#f5eee8] px-3 py-1 text-xs font-black uppercase text-black/40">
                            ID: {user.id.slice(0, 8)}
                          </span>
                        </div>
                      </div>

                      <form action={updateUserRole} className="flex gap-2">
                        <input type="hidden" name="user_id" value={user.id} />
                        <input type="hidden" name="q" value={q} />
                        <input type="hidden" name="current_role" value={selectedRole} />

                        <select
                          name="role"
                          defaultValue={role}
                          disabled={!canManage}
                          className="h-11 flex-1 rounded-full border border-black/10 bg-[#f8f3ef] px-4 text-sm font-black outline-none focus:border-rose-500 disabled:opacity-50"
                        >
                          {roleOptions.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>

                        <button
                          type="submit"
                          disabled={!canManage}
                          className="rounded-full bg-[#1b1210] px-4 text-xs font-black text-white transition hover:bg-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Save
                        </button>
                      </form>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Link href={`/admin/users/${user.id}`} className="rounded-full border border-black/10 bg-white px-4 py-3 text-xs font-black text-[#1b1210] transition hover:bg-rose-50">
                          View
                        </Link>

                        <form action={disableUser}>
                          <input type="hidden" name="user_id" value={user.id} />
                          <input type="hidden" name="q" value={q} />
                          <input type="hidden" name="current_role" value={selectedRole} />

                          <button
                            type="submit"
                            disabled={!canManage}
                            className="rounded-full border border-black/10 bg-[#f5eee8] px-4 py-3 text-xs font-black text-[#1b1210] transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Disable
                          </button>
                        </form>

                        <form action={deleteUser}>
                          <input type="hidden" name="user_id" value={user.id} />
                          <input type="hidden" name="q" value={q} />
                          <input type="hidden" name="current_role" value={selectedRole} />

                          <button
                            type="submit"
                            disabled={!canManage}
                            className="rounded-full bg-red-600 px-4 py-3 text-xs font-black text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Stat({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.06] p-4">
      <p className="text-xs font-black uppercase text-white/45">{title}</p>
      <p className="mt-2 text-3xl font-black">{value}</p>
    </div>
  );
}
