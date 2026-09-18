import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];

export default async function WeeklyPlanPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0,10);
  const { data: growth } = await getAdminDatabaseClient().from("social_growth_daily_snapshots").select("top_theme,top_area,followers_gained,reach").gte("snapshot_date", since);
  const count = (key: "top_theme"|"top_area") => { const m=new Map<string,number>(); for(const row of growth||[]){const value=row[key];if(value)m.set(value,(m.get(value)||0)+1);} return [...m.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0] || null; };
  const theme=count("top_theme") || "Date Night";
  const area=count("top_area") || "New York City";
  const ideas = [
    `${area} ${theme}`,
    `Birthday ideas under $100`,
    `Creator outing feature`,
    `Friday Night Picks`,
    `Tonight in ${area}`,
    `Something Different`,
    `Next Weekend Preview`,
  ];
  return <main className="min-h-screen bg-[#090706] px-4 py-6 text-white sm:px-6 lg:px-8"><div className="mx-auto max-w-5xl space-y-6"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.25em] text-rose-300">Social Manager</p><h1 className="mt-2 text-4xl font-semibold">Your Social Plan for This Week</h1><p className="mt-2 text-white/55">A balanced week built from what your audience is responding to. Approving the week creates editable drafts—it does not publish anything.</p></div><Link href="/admin/dashboard/marketing/social-manager" className="rounded-full border border-white/15 px-5 py-3 text-sm font-semibold">Back</Link></div>
    <section className="grid gap-3">{DAYS.map((day,index)=><div key={day} className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.05] p-5 sm:grid-cols-[130px_1fr] sm:items-center"><p className="font-semibold text-rose-200">{day}</p><div><p className="text-lg font-medium">{ideas[index]}</p><p className="mt-1 text-sm text-white/45">{index===2?"Use a creator collaboration or creator-style recommendation.":index===3?"Give people a complete Friday-night idea, not just a single place.":"Keep it useful, local, visual, and easy to save."}</p></div></div>)}</section>
    <form action="/api/admin/marketing/social-manager/weekly-plan" method="post"><input type="hidden" name="theme" value={theme}/><input type="hidden" name="area" value={area}/><button className="rounded-full bg-rose-600 px-6 py-3 text-sm font-semibold">Approve Week & Create Drafts</button></form>
  </div></main>;
}
