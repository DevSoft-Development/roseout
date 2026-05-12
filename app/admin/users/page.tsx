import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const ADMIN_USERS_VERSION = "admin-users-refresh-2026-05-11";

type SearchParams = {
  q?: string;
  role?: string;
};

type AppUser = {
  id: string;
  email: string | null;
  role: string | null;
  is_superadmin?: boolean | null;
  created_at: string | null;
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

function roleBadge(role?: string | null, isSuperadmin?: boolean | null) {
  if (isSuperadmin) return "border-rose-200 bg-rose-50 text-rose-700";
  if (role === "admin") return "border-rose-200 bg-rose-50 text-rose-700";
  if (role === "owner") return "border-black/10 bg-[#f5eee8] text-black/70";
  if (role === "disabled") return "border-red-200 bg-red-50 text-red-700";
  if (role === "user") return "border-black/10 bg-white text-black/55";

  return "border-black/10 bg-neutral-100 text-black/50";
}

async function updateUserRole(formData: FormData) {
  "use server";

  const userId = String(formData.get("user_id") || "");
  const role = String(formData.get("role") || "user");
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect("/admin/users");

  await supabaseAdmin.from("users").update({ role }).eq("id", userId);

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      role,
    },
  });

  redirect(
    `/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(
      currentRole
    )}`
  );
}

async function disableUser(formData: FormData) {
  "use server";

  const userId = String(formData.get("user_id") || "");
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect("/admin/users");

  await supabaseAdmin.auth.admin.updateUserById(userId, {
    ban_duration: "876000h",
    user_metadata: {
      role: "disabled",
      disabled: true,
    },
  });

  await supabaseAdmin
    .from("users")
    .update({
      role: "disabled",
      is_superadmin: false,
    })
    .eq("id", userId);

  redirect(
    `/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(
      currentRole
    )}`
  );
}

async function deleteUser(formData: FormData) {
  "use server";

  const userId = String(formData.get("user_id") || "");
  const q = String(formData.get("q") || "");
  const currentRole = String(formData.get("current_role") || "all");

  if (!userId) redirect("/admin/users");

  await supabaseAdmin.from("users").delete().eq("id", userId);
  await supabaseAdmin.auth.admin.deleteUser(userId);

  redirect(
    `/admin/users?q=${encodeURIComponent(q)}&role=${encodeURIComponent(
      currentRole
    )}`
  );
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const q = params.q || "";
  const selectedRole = params.role || "all";

  let query = supabaseAdmin
    .from("users")
    .select("*")
    .order("created_at", { ascending: false });

  if (q) {
    query = query.or(`email.ilike.%${q}%,role.ilike.%${q}%`);
  }

  if (selectedRole !== "all") {
    query = query.eq("role", selectedRole);
  }

  const { data: users, error } = await query;

  const { data: allUsers } = await supabaseAdmin.from("users").select("*");

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

  const safeUsers = (users || []) as AppUser[];
  const fullUsers = (allUsers || []) as AppUser[];

  const totalUsers = fullUsers.length;
  const admins = fullUsers.filter(
    (u) => u.role === "admin" || u.is_superadmin
  ).length;
  const owners = fullUsers.filter((u) => u.role === "owner").length;
  const regularUsers = fullUsers.filter((u) => u.role === "user").length;

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
              href="/admin/users/new"
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
              placeholder="Search by email or role..."
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
              <option className="text-black" value="user">
                User
              </option>
              <option className="text-black" value="owner">
                Owner
              </option>
              <option className="text-black" value="viewer">
                Viewer
              </option>
              <option className="text-black" value="editor">
                Editor
              </option>
              <option className="text-black" value="reviewer">
                Reviewer
              </option>
              <option className="text-black" value="admin">
                Admin
              </option>
              <option className="text-black" value="superuser">
                Superuser
              </option>
              <option className="text-black" value="disabled">
                Disabled
              </option>
            </select>

            <button
              type="submit"
              className="h-11 rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 text-sm font-black text-white shadow-lg transition hover:scale-[1.02]"
            >
              Search
            </button>
          </form>

          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "all",
              "user",
              "owner",
              "viewer",
              "editor",
              "reviewer",
              "admin",
              "superuser",
              "disabled",
            ].map((role) => (
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

            <Link
              href="/admin/users/new"
              className="rounded-full bg-[#1b1210] px-4 py-2 text-xs font-black text-white"
            >
              + Add User
            </Link>
          </div>

          {!safeUsers.length ? (
            <div className="p-10 text-center">
              <p className="text-lg font-black">No users found</p>

              <Link
                href="/admin/users/new"
                className="mt-4 inline-block rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white"
              >
                Create First User
              </Link>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {safeUsers.map((user) => {
                const displayRole = user.is_superadmin
                  ? "superadmin"
                  : user.role || "user";

                return (
                  <div
                    key={user.id}
                    className="rounded-[1.5rem] border border-black/10 bg-white p-4 shadow-sm transition hover:shadow-xl"
                  >
                    <div className="grid gap-4 xl:grid-cols-[1fr_280px_320px] xl:items-center">
                      <div>
                        <p className="truncate font-black">
                          {user.email || "No email"}
                        </p>

                        <p className="mt-1 text-xs text-black/40">
                          Created {formatDate(user.created_at)}
                        </p>

                        <div className="mt-2 flex flex-wrap gap-2">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-black uppercase ${roleBadge(
                              user.role,
                              user.is_superadmin
                            )}`}
                          >
                            {displayRole}
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
                          defaultValue={user.role || "user"}
                          className="h-11 flex-1 rounded-full border border-black/10 bg-[#f8f3ef] px-4 text-sm font-black outline-none focus:border-rose-500"
                        >
                          <option value="user">User</option>
                          <option value="owner">Owner</option>
                          <option value="viewer">Viewer</option>
                          <option value="editor">Editor</option>
                          <option value="reviewer">Reviewer</option>
                          <option value="admin">Admin</option>
                          <option value="superuser">Superuser</option>
                          <option value="disabled">Disabled</option>
                        </select>

                        <button
                          type="submit"
                          className="rounded-full bg-[#1b1210] px-4 text-xs font-black text-white transition hover:bg-rose-600"
                        >
                          Save
                        </button>
                      </form>

                      <div className="flex flex-wrap gap-2 xl:justify-end">
                        <Link
                          href={`/admin/users/${user.id}`}
                          className="rounded-full bg-[#1b1210] px-4 py-3 text-xs font-black text-white transition hover:bg-rose-600"
                        >
                          Edit User
                        </Link>

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