import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { getAdminSaasAnalytics } from "@/lib/admin/analytics/getAdminSaasAnalytics";
import { logAdminEvent } from "@/lib/admin/logAdminEvent";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
export const dynamic = "force-dynamic";

function fmt(n: number) {
  return Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n || 0);
}

function Stat({ label, value }: { label: string; value: number }) {
  const formatted = label.toLowerCase().includes("rate") ? `${fmt(value)}%` : fmt(value);
  return <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/45">{label}</p><p className="mt-2 text-3xl font-black">{formatted}</p></div>;
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-white/15 bg-black/20 p-5 text-sm text-white/55">{text}</div>;
}

export default async function AdminAnalyticsPage() {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.analytics);
  const analytics = await getAdminSaasAnalytics();
  await logAdminEvent({ category: "analytics", action: "analytics_dashboard_viewed", message: "Platform analytics dashboard viewed", actor_user_id: admin.user_id, actor_email: admin.email, entity_type: "platform", entity_id: "analytics" });

  const overviewLabels: Record<string, string> = {
    totalUsers: "Total users",
    activeUsers: "Active users",
    newUsers: "New users",
    totalLocations: "Total locations",
    searchableLocations: "Searchable locations",
    claimedLocations: "Claimed locations",
    unclaimedLocations: "Unclaimed locations",
    proLocations: "Pro locations",
    totalSearches: "Total searches 30d",
    noResultSearches: "No-result searches 30d",
    reservations: "Reservations/clicks 30d",
    phoneClicks: "Phone clicks 30d",
    websiteClicks: "Website clicks 30d",
    completedOutings: "Completed outings 30d",
    supportTicketsOpen: "Experience Inbox open",
    pendingClaims: "Pending claims",
    dataQualityIssues: "Data quality issues",
  };

  return <main className="min-h-screen bg-[#090706] px-4 pb-12 pt-6 text-white sm:px-6 lg:px-8">
    <div className="mx-auto max-w-[1500px] space-y-6">
      <section className="rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,29,72,0.22),transparent_30%),linear-gradient(135deg,#170b0b,#090706_58%,#14100c)] p-6 shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-rose-200">Executive SaaS Analytics</p>
        <h1 className="mt-3 text-4xl font-black tracking-tight">Platform Analytics</h1>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-white/65">A platform-wide operating dashboard for growth, search, locations, reservations, claims, support, data quality, and system health. Location-specific analytics now live in each CRM record.</p>
        <div className="mt-5 flex flex-wrap gap-3"><Link href="/admin/dashboard/crm" className="rounded-full bg-rose-600 px-5 py-3 text-sm font-black text-white">Open CRM</Link><Link href="/admin/dashboard/logs" className="rounded-full border border-white/10 bg-white/[0.06] px-5 py-3 text-sm font-black text-white/70">Platform Logs</Link></div>
      </section>

      {analytics.unavailable.length ? <section className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-100">Some optional data sources are not available yet: {analytics.unavailable.join(", ")}. Sections use real available data only.</section> : null}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {Object.entries(overviewLabels).map(([key, label]) => <Stat key={key} label={label} value={analytics.overview[key] || 0} />)}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Growth analytics</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Stat label="User growth" value={analytics.overview.newUsers} /><Stat label="Owner growth" value={analytics.overview.claimedLocations || analytics.overview.pendingClaims} /><Stat label="Location growth" value={analytics.overview.totalLocations} /><Stat label="Pro conversion rate" value={analytics.overview.totalLocations ? (analytics.overview.proLocations / analytics.overview.totalLocations) * 100 : 0} /></div><p className="mt-4 text-sm text-white/50">Connect dated signup and billing events to populate weekly/monthly trend charts.</p></article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Search analytics</h2>{analytics.search.topSearches.length ? <ul className="mt-4 space-y-2 text-sm text-white/70">{analytics.search.topSearches.map((item) => <li key={item.label} className="flex justify-between rounded-2xl border border-white/10 bg-black/20 p-3"><span>{item.label}</span><b>{fmt(item.count)}</b></li>)}</ul> : <Empty text="Top searches will appear after analytics_events store query metadata." />}</article>
        <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Operations analytics</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(analytics.operations).map(([key, value]) => <Stat key={key} label={key.replace(/([A-Z])/g, " $1")} value={value} />)}</div></article>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[ ["Top performing locations", analytics.locations.top], ["Upgrade opportunities", analytics.locations.upgradeOpportunities], ["High views / low conversion", analytics.locations.highViewsLowConversions] ].map(([title, rows]) => <article key={String(title)} className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">{String(title)}</h2>{(rows as any[]).length ? <ul className="mt-4 space-y-2 text-sm text-white/70">{(rows as any[]).map((row) => <li key={row.id || row.location_id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><Link href={`/admin/dashboard/crm/${row.id || row.location_id}`} className="font-black text-rose-200">{row.name || row.location_name}</Link><p className="text-xs text-white/45">Views {fmt(Number(row.profile_views_30d || 0))} · Search {fmt(Number(row.search_appearances_30d || 0))} · Opportunity {fmt(Number(row.opportunity_score || 0))}</p></li>)}</ul> : <Empty text="No real location analytics records are available for this section yet." />}</article>)}
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-5"><h2 className="text-xl font-black">Recent admin activity</h2>{analytics.recentActivity.length ? <ul className="mt-4 space-y-2 text-sm text-white/70">{analytics.recentActivity.map((log: any) => <li key={log.id} className="rounded-2xl border border-white/10 bg-black/20 p-3"><b>{log.level}</b> · {log.message}</li>)}</ul> : <Empty text="No admin logs yet. Logs will appear after admin actions are performed." />}</section>
    </div>
  </main>;
}
