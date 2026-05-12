import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import LoginAsUserButton from "./LoginAsUserButton";
import { getStrongPasswordErrors, strongPasswordMessage } from "@/lib/password-policy";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ updated?: string; error?: string }>;
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

async function updateUser(formData: FormData) {
  "use server";

  const userId = String(formData.get("user_id") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const phone = String(formData.get("phone") || "").trim();
  const role = String(formData.get("role") || "user");
  const subscriptionStatus = String(
    formData.get("subscription_status") || "free"
  );
  const password = String(formData.get("password") || "");

  if (!userId) redirect("/admin/users");

  if (password) {
    const passwordErrors = getStrongPasswordErrors(password);

    if (passwordErrors.length) {
      redirect(
        `/admin/users/${userId}?error=${encodeURIComponent(
          `Password must include: ${strongPasswordMessage()}.`
        )}`
      );
    }
  }

  const supabase = adminSupabase();

  await supabase
    .from("users")
    .update({
      full_name: fullName || null,
      email,
      phone: phone || null,
      role,
      subscription_status: subscriptionStatus,
      is_superadmin: role === "superuser",
    })
    .eq("id", userId);

  await supabase.auth.admin.updateUserById(userId, {
    email: email || undefined,
    password: password || undefined,
    user_metadata: {
      full_name: fullName || null,
      phone: phone || null,
      role,
    },
  });

  redirect(`/admin/users/${userId}?updated=1`);
}

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params;
  const notices = await searchParams;

  const supabase = adminSupabase();

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (!user) notFound();

  const { data: savedPlansData } = await supabase
    .from("saved_plans")
    .select("*")
    .eq("user_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const { data: logsData } = await supabase
    .from("admin_impersonation_logs")
    .select("*")
    .eq("target_user_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const savedPlans = (savedPlansData || []) as SavedPlan[];
  const logs = (logsData || []) as ImpersonationLog[];

  return (
    <main className="min-h-screen bg-[#080406] px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <Link
              href="/admin/users"
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

        {notices.updated && (
          <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-bold text-emerald-100">
            User updated successfully.
          </div>
        )}

        {notices.error && (
          <div className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
            {notices.error}
          </div>
        )}

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
              {savedPlans.length}
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

        <section className="mb-8 rounded-3xl border border-white/10 bg-[#f8f3ef] p-6 text-[#1b1210]">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-black">Edit User</h2>
              <p className="mt-1 text-sm font-medium text-black/55">
                Update profile details, access role, subscription status, or set a new strong password.
              </p>
            </div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-rose-700">
              Passwords require {strongPasswordMessage()}.
            </p>
          </div>

          <form action={updateUser} className="mt-6 grid gap-4 lg:grid-cols-2">
            <input type="hidden" name="user_id" value={user.id} />

            <label className="text-sm font-black">
              Full Name
              <input
                name="full_name"
                defaultValue={user.full_name || ""}
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
              />
            </label>

            <label className="text-sm font-black">
              Email
              <input
                name="email"
                type="email"
                required
                defaultValue={user.email || ""}
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
              />
            </label>

            <label className="text-sm font-black">
              Phone
              <input
                name="phone"
                defaultValue={user.phone || ""}
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
              />
            </label>

            <label className="text-sm font-black">
              Subscription Status
              <select
                name="subscription_status"
                defaultValue={user.subscription_status || "free"}
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
              >
                <option value="free">Free</option>
                <option value="pro">Pro</option>
                <option value="trialing">Trialing</option>
                <option value="past_due">Past Due</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <label className="text-sm font-black">
              Role
              <select
                name="role"
                defaultValue={user.is_superadmin ? "superuser" : user.role || "user"}
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
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
            </label>

            <label className="text-sm font-black">
              New Password (optional)
              <input
                name="password"
                type="password"
                minLength={12}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,}"
                title="Use at least 12 characters with uppercase, lowercase, number, and symbol."
                className="mt-2 h-12 w-full rounded-2xl border border-black/10 px-4 font-bold outline-none focus:border-rose-500"
                placeholder="Leave blank to keep current password"
              />
            </label>

            <div className="flex gap-3 lg:col-span-2">
              <button
                type="submit"
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-6 py-3 text-sm font-black text-white shadow-lg transition hover:scale-[1.03]"
              >
                Save User
              </button>
              <Link
                href="/admin/users"
                className="rounded-full border border-black/10 px-6 py-3 text-sm font-black"
              >
                Back to Users
              </Link>
            </div>
          </form>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:col-span-1">
            <h2 className="text-2xl font-bold">Account Details</h2>

            <div className="mt-6 space-y-4 text-sm">
              <div>
                <p className="text-white/40">Full Name</p>
                <p className="mt-1 font-semibold">
                  {user.full_name || "Not provided"}
                </p>
              </div>

              <div>
                <p className="text-white/40">Email</p>
                <p className="mt-1 break-all font-semibold">{user.email}</p>
              </div>

              <div>
                <p className="text-white/40">Phone</p>
                <p className="mt-1 font-semibold">
                  {user.phone || "Not provided"}
                </p>
              </div>

              <div>
                <p className="text-white/40">Stripe Customer ID</p>
                <p className="mt-1 break-all text-xs font-semibold">
                  {user.stripe_customer_id || "None"}
                </p>
              </div>

              <div>
                <p className="text-white/40">Stripe Subscription ID</p>
                <p className="mt-1 break-all text-xs font-semibold">
                  {user.stripe_subscription_id || "None"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 lg:col-span-2">
            <h2 className="text-2xl font-bold">Saved Plans</h2>

            {savedPlans.length === 0 ? (
              <p className="mt-6 text-white/50">This user has no saved plans.</p>
            ) : (
              <div className="mt-6 space-y-4">
                {savedPlans.map((plan) => (
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

          {logs.length === 0 ? (
            <p className="mt-6 text-white/50">
              No impersonation history for this user.
            </p>
          ) : (
            <div className="mt-6 space-y-3">
              {logs.map((log) => (
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