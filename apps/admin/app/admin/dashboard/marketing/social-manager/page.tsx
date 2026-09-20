import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function Stat({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/45">{label}</p><p className="mt-2 text-3xl font-semibold text-white">{value}</p>{note ? <p className="mt-1 text-sm text-white/50">{note}</p> : null}</div>;
}

export default async function SocialManagerPage() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [conversationResult, opportunityResult, growthResult, scheduledResult, approvalResult] = await Promise.all([
    getAdminDatabaseClient().from("social_community_conversations").select("id,status,person_type,intent,area,timing,opportunity_strength,opportunity_score,risk_level,last_message_at,social_community_contacts(username,display_name)").order("last_message_at", { ascending: false }).limit(100),
    getAdminDatabaseClient().from("social_growth_opportunities").select("id,provider,title,summary,area,timing,opportunity_strength,score,status").eq("status", "new").order("score", { ascending: false }).limit(12),
    getAdminDatabaseClient().from("social_growth_daily_snapshots").select("followers_gained,followers_lost,reach,profile_visits,website_visits,outing_searches,business_leads,paid_customers,new_mrr,top_theme,top_area").gte("snapshot_date", since.slice(0, 10)),
    getAdminDatabaseClient().from("marketing_content_items").select("id", { count: "exact", head: true }).eq("status", "scheduled"),
    getAdminDatabaseClient().from("marketing_approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const conversations = conversationResult.data || [];
  const opportunities = opportunityResult.data || [];
  const growth = growthResult.data || [];
  const sum = (key: string) => growth.reduce((total, row: any) => total + Number(row[key] || 0), 0);
  const needsReply = conversations.filter((row) => row.status === "needs_reply" || row.status === "escalated");
  const businessLeads = conversations.filter((row) => row.person_type === "business");
  const creatorLeads = conversations.filter((row) => row.person_type === "creator");
  const topTheme = growth.find((row: any) => row.top_theme)?.top_theme || "Not enough data yet";
  const topArea = growth.find((row: any) => row.top_area)?.top_area || "Not enough data yet";

  return <AdminPageShell>
      <AdminPageHeader
        eyebrow="Marketing · Social Operations"
        title="Social Manager"
        subtitle="Plan posts, answer people, find new opportunities, grow followers, and see what turns into real TheOutHaven activity."
        badge={<AdminStatusBadge tone={needsReply.length ? "amber" : "green"}>{needsReply.length ? `${needsReply.length} conversations need attention` : "Community queue clear"}</AdminStatusBadge>}
        actions={
          <>
            <AdminActionButton href="/admin/dashboard/marketing/content" variant="primary">Create Post</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/marketing/social-manager/weekly-plan">Plan This Week</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/marketing/community">Review Messages</AdminActionButton>
            <AdminActionButton href="/admin/dashboard/marketing/growth">View Growth</AdminActionButton>
          </>
        }
      />

      <section><h2 className="mb-3 text-xl font-semibold">Today</h2><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Stat label="Messages waiting" value={needsReply.length}/><Stat label="People looking for ideas" value={conversations.filter((row) => row.person_type === "consumer" && row.opportunity_score >= 50).length}/><Stat label="Business leads" value={businessLeads.length}/><Stat label="Creator leads" value={creatorLeads.length}/><Stat label="Posts scheduled" value={scheduledResult.count || 0}/><Stat label="Waiting for approval" value={approvalResult.count || 0}/></div></section>

      <section><h2 className="mb-3 text-xl font-semibold">Growth this week</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Stat label="Followers gained" value={sum("followers_gained").toLocaleString()}/><Stat label="People reached" value={sum("reach").toLocaleString()}/><Stat label="Website visits" value={sum("website_visits").toLocaleString()}/><Stat label="Outing searches" value={sum("outing_searches").toLocaleString()}/><Stat label="Business leads" value={sum("business_leads").toLocaleString()}/><Stat label="Paid customers" value={sum("paid_customers").toLocaleString()}/><Stat label="New monthly revenue" value={`$${sum("new_mrr").toLocaleString()}`}/><Stat label="What is working" value={topTheme} note={topArea !== "Not enough data yet" ? `Strongest area: ${topArea}` : undefined}/></div></section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-white/[0.05]"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold">Needs attention</h2><p className="text-sm text-white/45">Important conversations first.</p></div><Link href="/admin/dashboard/marketing/community" className="text-sm font-semibold text-rose-300">View all</Link></div><div className="divide-y divide-white/10">{needsReply.slice(0, 6).map((row: any) => { const contact = Array.isArray(row.social_community_contacts) ? row.social_community_contacts[0] : row.social_community_contacts; return <Link key={row.id} href={`/admin/dashboard/marketing/community?conversation=${row.id}`} className="block px-5 py-4 hover:bg-white/[0.04]"><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{contact?.display_name || contact?.username || "Social conversation"}</p><p className="mt-1 text-sm text-white/50">{row.intent || "New conversation"}{row.area ? ` · ${row.area}` : ""}{row.timing ? ` · ${row.timing}` : ""}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.risk_level === "red" ? "bg-red-500/15 text-red-200" : row.opportunity_strength === "very_strong" ? "bg-emerald-500/15 text-emerald-200" : "bg-white/10 text-white/60"}`}>{row.risk_level === "red" ? "Needs a person" : row.opportunity_strength === "very_strong" ? "Very strong opportunity" : "Needs reply"}</span></div></Link>})}{needsReply.length === 0 ? <div className="p-8 text-center text-sm text-white/45">You are caught up.</div> : null}</div></div>
        <div className="rounded-2xl border border-white/10 bg-white/[0.05]"><div className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 className="font-semibold">Growth opportunities</h2><p className="text-sm text-white/45">Public conversations and trends worth acting on.</p></div><Link href="/admin/dashboard/marketing/growth" className="text-sm font-semibold text-rose-300">View growth</Link></div><div className="divide-y divide-white/10">{opportunities.slice(0, 6).map((row: any) => <div key={row.id} className="px-5 py-4"><div className="flex justify-between gap-3"><div><p className="font-medium">{row.title}</p><p className="mt-1 text-sm text-white/50">{row.area || row.summary || "Social opportunity"}{row.timing ? ` · ${row.timing}` : ""}</p></div><span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200">{row.opportunity_strength === "very_strong" ? "Very strong" : row.opportunity_strength === "good" ? "Good opportunity" : "Low interest"}</span></div></div>)}{opportunities.length === 0 ? <div className="p-8 text-center text-sm text-white/45">No new public opportunities yet.</div> : null}</div></div>
      </section>
  </AdminPageShell>;
}
