import Link from "next/link";
import { redirect } from "next/navigation";
import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import BookSavedPlanButton from "@/components/user/BookSavedPlanButton";
import { requireUserForDashboard, getUserBetaStatus } from "@/lib/user-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function getPlanHighlights(plan: any) {
  const data = typeof plan.plan_data === "object" && plan.plan_data ? plan.plan_data : {};
  const restaurant = data.restaurant?.restaurant_name || data.restaurant?.name || plan.restaurant_name || "Restaurant to review";
  const activity = data.activity?.activity_name || data.activity?.name || plan.activity_name || "Activity to review";
  return { restaurant, activity };
}

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForDashboard(`/user/dashboard/saved/${id}`);
  const beta = await getUserBetaStatus(user.id, user.email);
  const { data: plan } = await supabaseAdmin.from("saved_plans").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!plan) redirect("/user/dashboard/saved");
  const highlights = getPlanHighlights(plan);

  return (
    <UserDashboardShell isBeta={Boolean(beta)}>
      <Link href="/user/dashboard/saved" className="text-sm font-bold text-rose-100">← Back to saved</Link>
      <DashboardCard className="mt-5 p-4 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[.25em] text-rose-200">Saved TheOutHaven Plan</p>
        <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] sm:text-4xl">{plan.title || "Your TheOutHaven Plan"}</h1>
        <p className="mt-3 text-sm font-semibold leading-6 text-white/60">{plan.summary || "Review your saved outing and continue when you are ready."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs font-black uppercase tracking-[.18em] text-rose-200">Restaurant</p><h2 className="mt-2 font-black">{highlights.restaurant}</h2></section>
          <section className="rounded-2xl border border-white/10 bg-black/30 p-4"><p className="text-xs font-black uppercase tracking-[.18em] text-rose-200">Activity</p><h2 className="mt-2 font-black">{highlights.activity}</h2></section>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row"><Link href="/create" className="inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-black">Create Similar</Link><BookSavedPlanButton plan={plan} /></div>
      </DashboardCard>
    </UserDashboardShell>
  );
}
