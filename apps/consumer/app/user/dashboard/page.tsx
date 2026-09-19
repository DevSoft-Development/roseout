import Link from "next/link";
import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import { getCurrentUserDashboardContext } from "@/lib/user-dashboard";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function displayName(ctx: any) {
  return ctx.profile?.preferred_name || "there";
}

function outingHref(item: any) {
  return item?.legacy_source === "saved_plans"
    ? `/user/dashboard/saved/${item.id}`
    : `/user/dashboard/outings/${item.id}`;
}

function OutingList({ items, empty }: { items: any[]; empty: string }) {
  if (!items.length) return <p className="mt-5 rounded-2xl border border-dashed border-white/15 p-6 text-white/55">{empty}</p>;
  return (
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {items.slice(0, 4).map((item: any) => (
        <Link key={`${item.legacy_source || "canonical"}-${item.id}`} href={outingHref(item)} className="rounded-2xl border border-white/10 bg-black/25 p-4 hover:border-rose-300/40">
          <h3 className="font-black">{item.title || item.restaurant_name || "TheOutHaven outing"}</h3>
          <p className="mt-2 line-clamp-2 text-sm text-white/55">{item.summary || [item.restaurant_name, item.activity_name].filter(Boolean).join(" + ") || "Open your outing details."}</p>
        </Link>
      ))}
    </div>
  );
}

function PlanCard({ ctx }: { ctx: any }) {
  return (
    <DashboardCard>
      <p className="text-xs font-black uppercase tracking-[.25em] text-rose-200">Current Plan / Search Access</p>
      <h2 className="mt-2 text-2xl font-black">{ctx.plan.label}</h2>
      <p className="mt-2 text-sm text-white/60">{ctx.isBeta ? "Unlimited searches during beta testing." : "Search limits are not active during early access."}</p>
      <p className="mt-3 text-sm font-bold text-white/80">Used this week: {ctx.weeklyUsage} / {ctx.plan.unlimited ? "Unlimited" : "3"}</p>
      <button disabled className="mt-4 rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/45">TheOutHaven Plus is coming soon</button>
    </DashboardCard>
  );
}

export default async function Page() {
  const ctx = await getCurrentUserDashboardContext();
  const saved = ctx.savedOutings || [];
  const upcoming = ctx.bookedOutings || [];
  const completed = ctx.completedOutings || [];
  const profile = ctx.profile as { preferred_name?: string | null; city?: string | null; birthday_month?: number | null };
  const profileIncomplete = !profile?.preferred_name || !profile?.city || !profile?.birthday_month;
  const { data: supportTickets } = await supabaseAdmin.from("support_tickets")
    .select("id,ticket_number,subject,category,status,updated_at,created_at")
    .eq("user_id", ctx.user.id)
    .order("updated_at", { ascending: false })
    .limit(4);

  return (
    <UserDashboardShell isBeta={ctx.isBeta}>
      <section className="rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,.22),transparent_34%),#120d0b] p-8">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[.3em] text-rose-200">TheOutHaven Portal {ctx.isBeta ? <span className="ml-2 rounded-full bg-rose-500/20 px-2 py-1">Beta Member</span> : null}</p>
            <h1 className="mt-3 text-4xl font-black md:text-5xl">Welcome back, {displayName(ctx)}</h1>
            <p className="mt-3 text-white/65">Your saved plans, upcoming outings, completed nights, and support requests stay organized here.</p>
          </div>
          <div className="flex gap-3">
            <Link href="/create" className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black">Create an Outing</Link>
            <Link href="/user/dashboard/outings" className="rounded-full border border-white/15 px-5 py-3 text-sm font-black">My Outings</Link>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <DashboardCard className="lg:col-span-2">
          <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.24em] text-rose-200">Saved</p><h2 className="mt-2 text-2xl font-black">Saved for later</h2></div><Link href="/user/dashboard/saved" className="text-sm font-bold text-rose-100">View all</Link></div>
          <OutingList items={saved} empty="No saved outings yet. Save a plan and it will appear here." />
        </DashboardCard>
        <PlanCard ctx={ctx} />

        <DashboardCard className="lg:col-span-2">
          <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.24em] text-rose-200">Upcoming / Booked</p><h2 className="mt-2 text-2xl font-black">Plans in motion</h2></div><Link href="/user/dashboard/outings" className="text-sm font-bold text-rose-100">View all</Link></div>
          <OutingList items={upcoming} empty="No upcoming outings yet. Start booking a saved plan and it will move here." />
        </DashboardCard>

        <DashboardCard>
          <p className="text-xs font-black uppercase tracking-[.24em] text-rose-200">Profile</p>
          <h2 className="mt-2 text-2xl font-black">{profileIncomplete ? "Complete your profile" : "Profile ready"}</h2>
          <p className="mt-2 text-sm text-white/60">We keep your consumer profile minimal: first name, city, birth month, and optional phone.</p>
          <Link href="/user/dashboard/account" className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black text-black">Open Account</Link>
        </DashboardCard>

        <DashboardCard className="lg:col-span-2">
          <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.24em] text-rose-200">Completed</p><h2 className="mt-2 text-2xl font-black">Past outings</h2></div><Link href="/user/dashboard/outings#completed" className="text-sm font-bold text-rose-100">View all</Link></div>
          <OutingList items={completed} empty="Completed outings will appear here after you mark an outing complete." />
        </DashboardCard>

        <DashboardCard>
          <div className="flex items-start justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-[.24em] text-rose-200">Support</p><h2 className="mt-2 text-2xl font-black">Your tickets</h2></div>
            <Link href="/user/dashboard/support" className="text-xs font-black text-rose-100">View all</Link>
          </div>
          <div className="mt-4 grid gap-2">
            {(supportTickets || []).length ? (supportTickets || []).map((ticket: any) => (
              <Link key={ticket.id} href={`/user/dashboard/support/${ticket.id}`} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="flex items-center justify-between gap-3"><span className="line-clamp-1 text-sm font-black">{ticket.subject}</span><span className="text-[11px] font-bold uppercase text-rose-100">{ticket.status}</span></div>
                <p className="mt-1 text-xs text-white/40">{ticket.ticket_number || "Support ticket"} · {ticket.category || "Other"}</p>
              </Link>
            )) : <p className="text-sm text-white/55">No support tickets yet.</p>}
          </div>
          <Link href="/user/dashboard/support" className="mt-4 inline-flex rounded-full border border-white/15 px-4 py-2 text-xs font-black">Open support</Link>
        </DashboardCard>

        {ctx.isBeta ? <DashboardCard><p className="text-xs font-black uppercase tracking-[.24em] text-rose-200">Beta Testing</p><h2 className="mt-2 text-2xl font-black">Beta tasks</h2><p className="mt-2 text-sm text-white/60">Continue testing, submit feedback, and report bugs.</p><Link href="/user/dashboard/beta" className="mt-4 inline-flex rounded-full bg-rose-600 px-4 py-2 text-xs font-black">Open Beta Dashboard</Link></DashboardCard> : null}
      </div>
    </UserDashboardShell>
  );
}
