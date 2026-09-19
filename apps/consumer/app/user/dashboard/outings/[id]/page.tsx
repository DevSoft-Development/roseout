import Link from "next/link";
import { redirect } from "next/navigation";
import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import { requireUserForDashboard, getUserBetaStatus, normalizeCanonicalOuting } from "@/lib/user-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const OUTING_SELECT = "id,status,plan_title,source_query,restaurant_location_id,activity_location_id,saved_at,reservation_clicked_at,call_clicked_at,completed_at,external_booking_started_at,external_booking_confirmed_at,external_reservation_url,metadata,created_at,updated_at";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForDashboard(`/user/dashboard/outings/${id}`);
  const beta = await getUserBetaStatus(user.id, user.email);
  const { data } = await supabaseAdmin.from("outings")
    .select(OUTING_SELECT)
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) redirect("/user/dashboard/outings");

  const outing = normalizeCanonicalOuting(data);
  return (
    <UserDashboardShell isBeta={Boolean(beta)}>
      <Link href="/user/dashboard/outings" className="text-sm font-bold text-rose-100">← Back to outings</Link>
      <DashboardCard className="mt-5 p-4 sm:p-6">
        <p className="text-xs font-black uppercase tracking-[.25em] text-rose-200">{outing.lifecycle_stage === "completed" ? "Completed" : outing.lifecycle_stage === "saved" ? "Saved" : "Upcoming"} Outing</p>
        <h1 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">{outing.title || "TheOutHaven Outing"}</h1>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <h2 className="font-black">Restaurant</h2>
            <p className="mt-2 text-white/70">{outing.restaurant_name || "TBD"}</p>
            {outing.restaurant_address ? <p className="text-sm text-white/45">{outing.restaurant_address}</p> : null}
            {outing.restaurant_url ? <a className="mt-3 inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-bold text-rose-100" href={outing.restaurant_url} rel="noopener noreferrer">Open link</a> : null}
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            <h2 className="font-black">Activity</h2>
            <p className="mt-2 text-white/70">{outing.activity_name || "TBD"}</p>
            {outing.activity_address ? <p className="text-sm text-white/45">{outing.activity_address}</p> : null}
          </div>
        </div>
        <Link href="/support" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-black">Contact support</Link>
      </DashboardCard>
    </UserDashboardShell>
  );
}
