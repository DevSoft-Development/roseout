import Link from "next/link";
import { redirect } from "next/navigation";
import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import { requireUserForDashboard, getUserBetaStatus } from "@/lib/user-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUserForDashboard(`/user/dashboard/outings/${id}`);
  const beta = await getUserBetaStatus(user.id, user.email);
  const { data: o } = await supabaseAdmin.from("user_outings").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (!o) redirect("/user/dashboard/outings");
  return <UserDashboardShell isBeta={Boolean(beta)}><Link href="/user/dashboard/outings" className="text-sm font-bold text-rose-100">← Back to outings</Link><DashboardCard className="mt-5 p-4 sm:p-6"><p className="text-xs font-black uppercase tracking-[.25em] text-rose-200">{o.status || "Booked"} Outing</p><h1 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">{o.title || "TheOutHaven Outing"}</h1><div className="mt-6 grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><h2 className="font-black">Restaurant</h2><p className="mt-2 text-white/70">{o.restaurant_name || "TBD"}</p>{o.restaurant_address ? <p className="text-sm text-white/45">{o.restaurant_address}</p> : null}{o.restaurant_url ? <a className="mt-3 inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-sm font-bold text-rose-100" href={o.restaurant_url}>Open link</a> : null}</div><div className="rounded-2xl border border-white/10 bg-black/30 p-4"><h2 className="font-black">Activity</h2><p className="mt-2 text-white/70">{o.activity_name || "TBD"}</p>{o.activity_address ? <p className="text-sm text-white/45">{o.activity_address}</p> : null}</div></div><Link href="/support" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full border border-white/15 px-4 py-2 text-xs font-black">Contact support</Link></DashboardCard></UserDashboardShell>;
}
