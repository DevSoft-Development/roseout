import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { requireAdminRole } from "@/lib/admin-auth";
import LoginAsUserButton from "./LoginAsUserButton";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type SavedPlan = {
  id: string;
  title: string | null;
  summary: string | null;
  created_at: string | null;
};

type ImpersonationLog = {
  id: string;
  admin_id: string | null;
  created_at: string | null;
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

export default async function AdminUserDetailPage({ params }: PageProps) {
  const currentAdmin = await requireAdminRole(["superuser", "admin"]);
  const canEditUser = currentAdmin.role === "superuser";

  const { id } = await params;

  const supabase = adminSupabase();

  const { data: user } = await supabase
    .from("users")
    .select("*")
    .eq("id", id)
    .single();

  if (!user) notFound();

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

          <div className="flex flex-wrap gap-2">
            {canEditUser && (
              <Link
                href={`/admin/dashboard/users/${user.id}/edit`}
                className="rounded-full bg-gradient-to-r from-rose-500 to-rose-700 px-5 py-3 text-sm font-black text-white shadow-lg hover:scale-[1.03]"
              >
                Edit User
              </Link>
            )}
            <LoginAsUserButton userId={user.id} />
          </div>
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

            {!savedPlans || savedPlans.length === 0 ? (
              <p className="mt-6 text-white/50">This user has no saved plans.</p>
            ) : (
              <div className="mt-6 space-y-4">
                {savedPlans.map((plan: SavedPlan) => (
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
              {logs.map((log: ImpersonationLog) => (
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