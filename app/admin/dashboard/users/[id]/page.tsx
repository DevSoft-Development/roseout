import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { getCurrentAdmin } from "@/lib/admin-auth";
import LoginAsUserButton from "./LoginAsUserButton";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type SavedPlan = {
  id: string;
  title?: string | null;
  summary?: string | null;
  created_at?: string | null;
};

type ImpersonationLog = {
  id: string;
  admin_id?: string | null;
  created_at?: string | null;
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

function isSuperuserRole(role?: string | null, isSuperadmin?: boolean | null) {
  const normalized = String(role || "").toLowerCase();
  return Boolean(isSuperadmin) || normalized === "superuser" || normalized === "superadmin";
}

function roleOptionsFor(adminRole: string) {
  return adminRole === "superuser"
    ? editableRoles
    : editableRoles.filter((role) => role !== "superuser");
}

async function updateAdminUser(formData: FormData) {
  "use server";

  const currentAdmin = await getCurrentAdmin();
  const userId = String(formData.get("user_id") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const role = String(formData.get("role") || "user").trim();
  const subscriptionStatus = String(
    formData.get("subscription_status") || "free"
  ).trim();

  if (!userId || !email) redirect("/admin/dashboard/users");
  if (!["superuser", "admin"].includes(currentAdmin.role)) {
    redirect("/admin/unauthorized");
  }

  const supabase = adminSupabase();
  const [{ data: profile }, { data: authUser }] = await Promise.all([
    supabase.from("users").select("role, is_superadmin").eq("id", userId).maybeSingle(),
    supabase.auth.admin.getUserById(userId),
  ]);

  const targetIsSuperuser = isSuperuserRole(
    profile?.role || (authUser.user?.user_metadata?.role as string | undefined),
    profile?.is_superadmin ||
      Boolean(
        authUser.user?.user_metadata?.is_superadmin ||
          authUser.user?.app_metadata?.is_superadmin
      )
  );

  if (currentAdmin.role !== "superuser" && targetIsSuperuser) {
    redirect("/admin/unauthorized");
  }

  const allowedRoles = roleOptionsFor(currentAdmin.role);

  if (!allowedRoles.includes(role)) {
    redirect("/admin/unauthorized");
  }

  const isSuperadmin = role === "superuser";

  await supabase.auth.admin.updateUserById(userId, {
    email,
    user_metadata: {
      ...(authUser.user?.user_metadata || {}),
      full_name: fullName || null,
      phone: phone || null,
      role,
      is_superadmin: isSuperadmin,
    },
  });

  await supabase.from("users").upsert(
    {
      id: userId,
      email,
      full_name: fullName || null,
      phone: phone || null,
      role,
      subscription_status: subscriptionStatus || "free",
      is_superadmin: isSuperadmin,
    },
    { onConflict: "id" }
  );

  redirect(`/admin/dashboard/users/${userId}?updated=1`);
}

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

export default async function AdminUserDetailPage({ params }: PageProps) {
  const currentAdmin = await getCurrentAdmin();

  if (!["superuser", "admin"].includes(currentAdmin.role)) {
    notFound();
  }

  const { id } = await params;

  const supabase = adminSupabase();

  const [{ data: profile }, { data: authUser }] = await Promise.all([
    supabase.from("users").select("*").eq("id", id).maybeSingle(),
    supabase.auth.admin.getUserById(id),
  ]);

  const user = {
    ...(profile || {}),
    id,
    email: profile?.email || authUser.user?.email || null,
    full_name:
      profile?.full_name ||
      (authUser.user?.user_metadata?.full_name as string | undefined) ||
      (authUser.user?.user_metadata?.name as string | undefined) ||
      null,
    phone:
      profile?.phone ||
      (authUser.user?.user_metadata?.phone as string | undefined) ||
      null,
    role:
      profile?.role ||
      (authUser.user?.user_metadata?.role as string | undefined) ||
      "user",
    subscription_status: profile?.subscription_status || "free",
    created_at: profile?.created_at || authUser.user?.created_at || null,
    is_superadmin:
      profile?.is_superadmin ||
      Boolean(
        authUser.user?.user_metadata?.is_superadmin ||
          authUser.user?.app_metadata?.is_superadmin
      ),
  };

  const userRole = String(user.role || "").toLowerCase();
  const targetIsSuperuser =
    Boolean(user.is_superadmin) || userRole === "superuser" || userRole === "superadmin";

  if (!authUser.user && !profile) notFound();
  if (currentAdmin.role !== "superuser" && targetIsSuperuser) notFound();

  const { data: savedPlans } = await supabase
    .from("saved_plans")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: logs } = await supabase
    .from("admin_impersonation_logs")
    .select("*")
    .eq("target_user_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <main className="min-h-screen bg-[#080406] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/admin/dashboard/users"
              className="mb-4 inline-flex text-sm font-bold text-rose-300 hover:text-rose-200"
            >
              ← Back to Users
            </Link>

            <h1 className="text-4xl font-bold">
              {user.full_name || "User Profile"}
            </h1>
            <p className="mt-2 text-white/50">{user.email}</p>
          </div>

          <LoginAsUserButton userId={user.id} />
        </div>

        <section className="mb-8 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-sm text-white/50">Role</p>
            <h2 className="mt-2 text-2xl font-bold capitalize">
              {user.role || "user"}
            </h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-sm text-white/50">Subscription</p>
            <h2 className="mt-2 text-2xl font-bold capitalize">
              {user.subscription_status || "free"}
            </h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-sm text-white/50">Saved Plans</p>
            <h2 className="mt-2 text-2xl font-bold">
              {savedPlans?.length || 0}
            </h2>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-sm text-white/50">Joined</p>
            <h2 className="mt-2 text-sm font-bold">
              {user.created_at
                ? new Date(user.created_at).toLocaleDateString()
                : "Unknown"}
            </h2>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:col-span-1">
            <h2 className="text-2xl font-bold">Edit Account</h2>

            <form action={updateAdminUser} className="mt-6 space-y-4 text-sm">
              <input type="hidden" name="user_id" value={user.id} />

              <label className="block">
                <span className="text-white/40">Full Name</span>
                <input
                  name="full_name"
                  defaultValue={user.full_name || ""}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-semibold text-white outline-none focus:border-rose-400"
                />
              </label>

              <label className="block">
                <span className="text-white/40">Email</span>
                <input
                  name="email"
                  type="email"
                  required
                  defaultValue={user.email || ""}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-semibold text-white outline-none focus:border-rose-400"
                />
              </label>

              <label className="block">
                <span className="text-white/40">Phone</span>
                <input
                  name="phone"
                  defaultValue={user.phone || ""}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-semibold text-white outline-none focus:border-rose-400"
                />
              </label>

              <label className="block">
                <span className="text-white/40">Role</span>
                <select
                  name="role"
                  defaultValue={targetIsSuperuser ? "superuser" : user.role || "user"}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-semibold text-white outline-none focus:border-rose-400"
                >
                  {roleOptionsFor(currentAdmin.role).map((role) => (
                    <option key={role} value={role} className="text-black">
                      {role}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-white/40">Subscription</span>
                <select
                  name="subscription_status"
                  defaultValue={user.subscription_status || "free"}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-semibold text-white outline-none focus:border-rose-400"
                >
                  {["free", "active", "trialing", "past_due", "cancelled"].map(
                    (status) => (
                      <option key={status} value={status} className="text-black">
                        {status}
                      </option>
                    )
                  )}
                </select>
              </label>

              <button
                type="submit"
                className="w-full rounded-full bg-white px-5 py-3 text-sm font-black text-black transition hover:bg-rose-100"
              >
                Save User
              </button>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-white/40">Stripe Customer ID</p>
                <p className="mt-1 break-all text-xs font-semibold">
                  {user.stripe_customer_id || "None"}
                </p>

                <p className="mt-4 text-white/40">Stripe Subscription ID</p>
                <p className="mt-1 break-all text-xs font-semibold">
                  {user.stripe_subscription_id || "None"}
                </p>
              </div>
            </form>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:col-span-2">
            <h2 className="text-2xl font-bold">Saved Plans</h2>

            {!savedPlans || savedPlans.length === 0 ? (
              <p className="mt-6 text-white/50">This user has no saved plans.</p>
            ) : (
              <div className="mt-6 space-y-4">
                {(savedPlans as SavedPlan[]).map((plan) => (
                  <div
                    key={plan.id}
                    className="rounded-2xl border border-white/10 bg-black/30 p-4"
                  >
                    <h3 className="font-bold">
                      {plan.title || "TheOutHaven Plan"}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-sm text-white/50">
                      {plan.summary || "Saved outing plan."}
                    </p>
                    <p className="mt-3 text-xs text-white/30">
                      {plan.created_at
                        ? new Date(plan.created_at).toLocaleString()
                        : ""}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="mt-6 rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-bold">Impersonation History</h2>

          {!logs || logs.length === 0 ? (
            <p className="mt-6 text-white/50">
              No impersonation history for this user.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {(logs as ImpersonationLog[]).map((log) => (
                <div
                  key={log.id}
                  className="rounded-2xl border border-white/10 bg-black/30 p-4 text-sm"
                >
                  <p className="font-semibold">
                    Admin ID:{" "}
                    <span className="text-white/50">{log.admin_id}</span>
                  </p>
                  <p className="mt-1 text-white/40">
                    {log.created_at
                      ? new Date(log.created_at).toLocaleString()
                      : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}