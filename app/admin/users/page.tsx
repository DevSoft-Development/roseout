import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/admin-auth";
import ImpersonateButton from "@/components/admin/ImpersonateButton";
import { formatRoleLabel, isAdminRole, isUserRole, normalizeRole, USER_ROLE_OPTIONS } from "@/lib/users/roles";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";

const ADMIN_USERS_VERSION = "admin-users-refresh-2026-05-11";
const ADMIN_USERS_BASE_PATH = "/admin/dashboard/users";

type SearchParams = {
  q?: string;
  role?: string;
};

type AppUser = {
  id: string;
  email: string | null;
  full_name?: string | null;
  role: string | null;
  created_at: string | null;
  zip_code?: string | null;
  derived_city?: string | null;
  derived_state?: string | null;
  derived_market_area?: string | null;
  outing_preferences?: string[] | null;
  budget_range?: string | null;
  preferred_areas?: string[] | null;
  nightlife_frequency?: string | null;
  interested_in_member_perks?: boolean | null;
  sms_opt_in?: boolean | null;
  plan?: string | null;
  plan_status?: string | null;
  premium_until?: string | null;
  weekly_search_limit?: number | null;
};

type AdminUserRow = {
  user_id: string;
  role: string | null;
  created_at?: string | null;
};

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

function roleBadge(role?: string | null) {
  const normalizedRole = normalizeRole(role);
  if (normalizedRole === "superadmin") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalizedRole === "admin") return "border-rose-200 bg-rose-50 text-rose-700";
  if (normalizedRole === "owner") return "border-black/10 bg-[#f5eee8] text-black/70";
  if (normalizedRole === "disabled") return "border-red-200 bg-red-50 text-red-700";
  if (normalizedRole === "user") return "border-black/10 bg-white text-black/55";

  return "border-black/10 bg-neutral-100 text-black/50";
}

async function updateUserRole(formData: FormData) {
  "use server";

  await requireAdminRole(ADMIN_PAGE_ACCESS.adminUsers);

  const userId = String(formData.get("user_id") || "");
  const role = normalizeRole(String(formData.get("role") || "user"));
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect(ADMIN_USERS_BASE_PATH);
  if (!isUserRole(role)) redirect(ADMIN_USERS_BASE_PATH);

  await supabaseAdmin.from("users").upsert(
    {
      id: userId,
      role,
    },
    { onConflict: "id" }
  );

  if (isAdminRole(role)) {
    await supabaseAdmin.from("admin_users").upsert(
      {
        user_id: userId,
        role,
      },
      { onConflict: "user_id" },
    );
  } else {
    await supabaseAdmin.from("admin_users").delete().eq("user_id", userId);
  }

  redirect(
    `${ADMIN_USERS_BASE_PATH}?q=${encodeURIComponent(q)}&role=${encodeURIComponent(
      currentRole
    )}`
  );
}

async function disableUser(formData: FormData) {
  "use server";

  await requireAdminRole(ADMIN_PAGE_ACCESS.adminUsers);

  const userId = String(formData.get("user_id") || "");
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect(ADMIN_USERS_BASE_PATH);

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
    user_metadata: {
      disabled: true,
    },
  });

  await supabaseAdmin
    .from("users")
    .update({
      role: "disabled",
    })
    .eq("id", userId);

  await supabaseAdmin.from("admin_users").delete().eq("user_id", userId);

  redirect(
    `${ADMIN_USERS_BASE_PATH}?q=${encodeURIComponent(q)}&role=${encodeURIComponent(
      currentRole
    )}`
  );
}

async function deleteUser(formData: FormData) {
  "use server";

  await requireAdminRole(ADMIN_PAGE_ACCESS.adminUsers);

  const userId = String(formData.get("user_id") || "");
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect(ADMIN_USERS_BASE_PATH);

  await supabaseAdmin.from("users").delete().eq("id", userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);

  redirect(
    `${ADMIN_USERS_BASE_PATH}?q=${encodeURIComponent(q)}&role=${encodeURIComponent(
      currentRole
    )}`
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const currentAdmin = await requireAdminRole(ADMIN_PAGE_ACCESS.adminUsers);
  const canEditUsers = currentAdmin.role === "superadmin";
  const canImpersonate = currentAdmin.role === "superadmin";

  const params = await searchParams;

  const q = params.q || "";
  const selectedRole = params.role === "all" || !params.role ? "all" : normalizeRole(params.role) || "all";

  const [profileUsersResult, authUsersResult, adminUsersResult] = await Promise.all([
    supabaseAdmin.from("users").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    supabaseAdmin.from("admin_users").select("user_id, role, created_at"),
  ]);

  const error = profileUsersResult.error && authUsersResult.error
    ? profileUsersResult.error
    : null;

  if (error) {
    return (
      <main
        data-page-version={ADMIN_USERS_VERSION}
        className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white"
      >
        <div className="mx-auto max-w-[1500px]">
          <div className="rounded-[1.75rem] border border-rose-500/30 bg-rose-500/10 p-6">
            <p className="text-sm font-black">Database Error</p>
            <p className="mt-2 text-sm">{error.message}</p>
          </div>
        </div>
      </main>
    );
  }

  const profileUsers = (profileUsersResult.data || []) as AppUser[];
  const authUsers = authUsersResult.data?.users || [];
  const adminUsers = (adminUsersResult.data || []) as AdminUserRow[];
  const adminUsersByUserId = new Map(
    adminUsers.map((adminUser) => [adminUser.user_id, adminUser])
  );

  const fullUsersById = new Map<string, AppUser>();

  for (const profileUser of profileUsers) {
    fullUsersById.set(profileUser.id, profileUser);
  }

  for (const authUser of authUsers) {
    const existingUser = fullUsersById.get(authUser.id);
    const email = (existingUser?.email || authUser.email || null)?.toLowerCase() || null;
    const adminUser = adminUsersByUserId.get(authUser.id) || null;
    const metadata = authUser.user_metadata || {};
    const metadataName =
      typeof metadata.full_name === "string"
        ? metadata.full_name
        : typeof metadata.name === "string"
          ? metadata.name
          : null;
    const role = normalizeRole(existingUser?.role || adminUser?.role || "user");

    fullUsersById.set(authUser.id, {
      id: authUser.id,
      email,
      full_name: existingUser?.full_name || metadataName || null,
      role,
      created_at: existingUser?.created_at || authUser.created_at || null,
    });
  }

  const fullUsers = Array.from(fullUsersById.values()).sort(
    (a, b) =>
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );

  const safeUsers = fullUsers.filter((user) => {
    const displayRole = normalizeRole(user.role);
    const matchesQuery = q
      ? [user.email, user.full_name, displayRole, user.id, user.zip_code, user.derived_market_area]
          .filter(Boolean)
          .some((value) => value!.toLowerCase().includes(q.toLowerCase()))
      : true;
    const matchesRole =
      selectedRole === "all" ||
      displayRole === selectedRole ||
      normalizeRole(user.role) === selectedRole;

    return matchesQuery && matchesRole;
  });

  const totalUsers = fullUsers.length;
  const admins = fullUsers.filter(
    (u) => isAdminRole(normalizeRole(u.role)) ? true : false
  ).length;
  const owners = fullUsers.filter((u) => normalizeRole(u.role) === "owner").length;
  const regularUsers = fullUsers.filter((u) => normalizeRole(u.role) === "user").length;

  return (
    <main
      data-page-version={ADMIN_USERS_VERSION}
      className="min-h-screen bg-[#090706] px-4 pb-10 pt-4 text-white"
    >
      <div className="mx-auto max-w-[1500px]">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_35%),linear-gradient(135deg,#160b0b,#090706_55%,#140f0a)] p-6 shadow-2xl">
          <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-rose-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.3em] text-rose-300">
                TheOutHaven Admin
              </p>

              <h1 className="mt-2 text-4xl font-black">Users</h1>

              <p className="mt-2 text-sm text-white/60">
                Search users, filter roles, edit access, disable accounts, and
                remove users.
              </p>
            </div>

            <Link
              href="/admin/dashboard/users/new"
              className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg hover:scale-[1.03]"
            >
              + Create User
            </Link>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-4">
          <Stat title="Total Users" value={formatNumber(totalUsers)} />
          <Stat title="Admins" value={formatNumber(admins)} />
          <Stat title="Owners" value={formatNumber(owners)} />
          <Stat title="Customers" value={formatNumber(regularUsers)} />
        </section>

        <section className="mt-5 rounded-[1.75rem] border border-white/10 bg-[#120d0b] p-4 shadow-2xl">
          <form className="grid gap-3 md:grid-cols-[1fr_220px_140px]">
            <input
              name="q"
              defaultValue={q}
              placeholder="Search email, name, id, zip, or market area..."
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-semibold text-white outline-none placeholder:text-white/35 focus:border-rose-300"
            />

            <select
              name="role"
              defaultValue={selectedRole}
              className="h-11 rounded-full border border-white/10 bg-white/[0.07] px-5 text-sm font-bold text-white outline-none focus:border-rose-300"
            >
              <option className="text-black" value="all">
                All Roles
              </option>
              {USER_ROLE_OPTIONS.map((option) => (
                <option key={option.value} className="text-black" value={option.value}>
                  {option.label}
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
            {["all", ...USER_ROLE_OPTIONS.map((option) => option.value)].map((role) => (
              <Link
                key={role}
                href={`/admin/dashboard/users?q=${encodeURIComponent(q)}&role=${role}`}
                className={`rounded-full border px-4 py-2 text-[11px] font-black uppercase tracking-wide transition ${
                  selectedRole === role
                    ? "border-rose-400 bg-rose-500 text-white"
                    : "border-white/10 bg-white/[0.06] text-white/55 hover:bg-white/10 hover:text-white"
                }`}
              >
                {role === "all" ? "All" : formatRoleLabel(role)}
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

            <Link
              href="/admin/dashboard/users/new"
              className="rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white"
            >
              + Add User
            </Link>
          </div>

          {!safeUsers.length ? (
            <div className="p-10 text-center">
              <p className="text-lg font-black">No users found</p>

              <Link
                href="/admin/dashboard/users/new"
                className="mt-4 inline-block rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white"
              >
                Create First User
              </Link>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {safeUsers.map((user) => {
                const displayRole = normalizeRole(user.role) || "user";

                return (
                  <div
                    key={user.id}
                    className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm transition hover:shadow-xl"
                  >
                    <div className="grid gap-4 xl:grid-cols-[1fr_280px_320px] xl:items-center">
                      <div>
                        <p className="truncate font-black">
                          {user.email || "No email"}
                          {user.full_name && (
                            <span className="ml-2 text-sm font-bold text-black/40">{user.full_name}</span>
                          )}
                        </p>

                        <p className="mt-1 text-xs text-black/40">
                          Created {formatDate(user.created_at)}
                        </p>



                        <p className="mt-2 text-xs text-black/55">
                          {user.derived_city || "—"}, {user.derived_state || "—"} · {user.derived_market_area || "No market"} · ZIP {user.zip_code || "—"}
                        </p>
                        <p className="mt-1 text-xs text-black/55">
                          Preferences: {(user.outing_preferences || []).join(", ") || "—"} | Budget: {user.budget_range || "—"} | Areas: {(user.preferred_areas || []).join(", ") || "—"}
                        </p>
                        <p className="mt-1 text-xs text-black/55">
                          Frequency: {user.nightlife_frequency || "—"} | Member perks: {user.interested_in_member_perks ? "Yes" : "No"} | SMS: {user.sms_opt_in ? "Opted in" : "Not opted in"}
                        </p>
                        <p className="mt-1 text-xs text-black/55">
                          Plan: {user.plan || "free"} ({user.plan_status || "active"}) · Premium until: {formatDate(user.premium_until || null)} · Weekly search limit: {user.weekly_search_limit ?? "—"}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${roleBadge(displayRole)}`}
                          >
                            {formatRoleLabel(displayRole)}
                          </span>

                          <span className="rounded-full border border-black/10 bg-[#f5eee8] px-3 py-1 text-xs font-black uppercase text-black/40">
                            ID: {user.id.slice(0, 8)}
                          </span>
                        </div>
                      </div>

                      <form action={updateUserRole} className="flex gap-2">
                        <input type="hidden" name="user_id" value={user.id} />
                        <input type="hidden" name="q" value={q} />
                        <input
                          type="hidden"
                          name="current_role"
                          value={selectedRole}
                        />

                        <select
                          name="role"
                          defaultValue={displayRole}
                          className="h-11 flex-1 rounded-full border border-black/10 bg-[#f8f3ef] px-4 text-sm font-black outline-none focus:border-rose-500"
                        >
                          {USER_ROLE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>

                        <button
                          type="submit"
                          className="rounded-full bg-[#1b1210] px-4 text-xs font-black text-white transition hover:bg-rose-600"
                        >
                          Save
                        </button>
                      </form>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        {canEditUsers && (
                          <Link
                            href={`/admin/dashboard/users/${user.id}/edit`}
                            className="rounded-full bg-[#1b1210] px-4 py-3 text-xs font-black text-white transition hover:bg-rose-600"
                          >
                            Edit
                          </Link>
                        )}

                        {canImpersonate && (
                          <ImpersonateButton
                            userId={user.id}
                            targetType="user"
                            label="Log in as user"
                            className="rounded-full border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-black text-rose-700 transition hover:bg-rose-600 hover:text-white disabled:opacity-50"
                          />
                        )}

                        <form action={disableUser}>
                          <input type="hidden" name="user_id" value={user.id} />
                          <input type="hidden" name="q" value={q} />
                          <input
                            type="hidden"
                            name="current_role"
                            value={selectedRole}
                          />

                          <button
                            type="submit"
                            className="rounded-full border border-black/10 bg-[#f5eee8] px-4 py-3 text-xs font-black text-[#1b1210] transition hover:bg-amber-100"
                          >
                            Disable
                          </button>
                        </form>

                        <form action={deleteUser}>
                          <input type="hidden" name="user_id" value={user.id} />
                          <input type="hidden" name="q" value={q} />
                          <input
                            type="hidden"
                            name="current_role"
                            value={selectedRole}
                          />

                          <button
                            type="submit"
                            className="rounded-full bg-red-600 px-4 py-3 text-xs font-black text-white transition hover:bg-red-700"
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
