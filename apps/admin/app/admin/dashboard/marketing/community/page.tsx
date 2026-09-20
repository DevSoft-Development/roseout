import Link from "next/link";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { communitySearchLink } from "@/lib/marketing/social-manager";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import {
  AdminActionButton,
  AdminPageHeader,
  AdminPageShell,
  AdminStatusBadge,
} from "../../../../../components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";

function journeyLabel(name: string) {
  const value = name.toLowerCase();
  if (value.includes("search")) return "Searched for an outing";
  if (value.includes("plan_selected") || value.includes("outing_open")) return "Selected an outing";
  if (value.includes("reserve") || value.includes("reservation")) return "Clicked Reserve";
  if (value.includes("call")) return "Clicked Call";
  if (value.includes("direction")) return "Opened Directions";
  if (value.includes("save")) return "Saved an outing";
  if (value.includes("signup") || value.includes("register")) return "Created an account";
  if (value.includes("complete") && value.includes("outing")) return "Completed an outing";
  if (value.includes("page") || value.includes("visit") || value.includes("landing")) return "Visited TheOutHaven";
  return name.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ conversation?: string }> }) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const params = await searchParams;
  const { data: conversations } = await getAdminDatabaseClient().from("social_community_conversations").select("id,provider,status,person_type,intent,occasion,area,timing,sentiment,opportunity_strength,risk_level,last_message_at,metadata,social_community_contacts(username,display_name)").order("last_message_at", { ascending: false }).limit(100);
  const selectedId = params.conversation || conversations?.[0]?.id || null;
  const [messageResult, journeyResult] = selectedId ? await Promise.all([
    getAdminDatabaseClient().from("social_community_messages").select("id,direction,sender_type,body,status,created_at").eq("conversation_id", selectedId).order("created_at"),
    getAdminDatabaseClient().from("analytics_events").select("id,event_name,event_type,query,source,occurred_at,created_at,metadata").eq("metadata->>social_conversation_id", selectedId).order("occurred_at", { ascending: true }).limit(100),
  ]) : [{ data: [] as any[] }, { data: [] as any[] }];
  const messages = messageResult.data || [];
  const journey = journeyResult.data || [];
  const selected = conversations?.find((row) => row.id === selectedId) as any;
  const contact = selected ? (Array.isArray(selected.social_community_contacts) ? selected.social_community_contacts[0] : selected.social_community_contacts) : null;
  const suggestion = String(selected?.metadata?.suggested_reply || "");
  const trackingLink = selected?.person_type === "consumer" ? communitySearchLink({ conversationId: selected.id, provider: selected.provider, query: [selected.occasion, selected.area, selected.timing].filter(Boolean).join(" ") || null }) : null;
  const suggestedReply = trackingLink && suggestion ? `${suggestion}\n\n${trackingLink}` : suggestion;

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow="Social Manager · Community"
      title="Community"
      subtitle="Messages, customer opportunities, business leads, creator interest, and conversations that need a person."
      badge={<AdminStatusBadge tone={(conversations || []).some((row: any) => row.risk_level === "red" || row.status === "needs_reply") ? "amber" : "green"}>{(conversations || []).length} conversations loaded</AdminStatusBadge>}
      actions={<AdminActionButton href="/admin/dashboard/marketing/social-manager">Social Manager</AdminActionButton>}
    />
    <div className="grid min-h-[650px] gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
      <section className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05]"><div className="border-b border-white/10 px-4 py-3 font-semibold">Messages</div><div className="max-h-[820px] overflow-y-auto divide-y divide-white/10">{(conversations || []).map((row: any) => { const c = Array.isArray(row.social_community_contacts) ? row.social_community_contacts[0] : row.social_community_contacts; return <Link key={row.id} href={`/admin/dashboard/marketing/community?conversation=${row.id}`} className={`block px-4 py-4 ${row.id === selectedId ? "bg-rose-500/10" : "hover:bg-white/[0.04]"}`}><div className="flex justify-between gap-3"><div><p className="font-medium">{c?.display_name || c?.username || "Social user"}</p><p className="mt-1 text-sm text-white/45">{row.intent || row.person_type}{row.area ? ` · ${row.area}` : ""}</p></div><span className={`h-fit rounded-full px-2.5 py-1 text-[11px] font-semibold ${row.risk_level === "red" ? "bg-red-500/15 text-red-200" : row.status === "ai_handled" ? "bg-sky-500/15 text-sky-200" : "bg-white/10 text-white/60"}`}>{row.risk_level === "red" ? "Needs a person" : row.status === "ai_handled" ? "AI handled" : "Needs reply"}</span></div></Link>})}{!conversations?.length ? <div className="p-8 text-center text-sm text-white/45">No conversations yet.</div> : null}</div></section>
      <section className="rounded-2xl border border-white/10 bg-white/[0.05]">{selected ? <><div className="border-b border-white/10 p-5"><div className="flex flex-wrap justify-between gap-3"><div><h2 className="text-xl font-semibold">{contact?.display_name || contact?.username || "Conversation"}</h2><p className="mt-1 text-sm text-white/45 capitalize">{selected.provider} · {selected.person_type}{selected.area ? ` · ${selected.area}` : ""}{selected.timing ? ` · ${selected.timing}` : ""}</p></div><div className="flex gap-2"><span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">{selected.opportunity_strength === "very_strong" ? "Very strong opportunity" : selected.opportunity_strength === "good" ? "Good opportunity" : "Low interest"}</span>{selected.risk_level !== "green" ? <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${selected.risk_level === "red" ? "bg-red-500/15 text-red-200" : "bg-amber-500/15 text-amber-200"}`}>{selected.risk_level === "red" ? "Human only" : "Review before sending"}</span> : null}</div></div></div>
        <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_330px]"><div><div className="space-y-3">{messages.map((message: any) => <div key={message.id} className={`max-w-[82%] rounded-2xl px-4 py-3 text-sm leading-6 ${message.direction === "outbound" ? "ml-auto bg-rose-600 text-white" : "bg-white/10 text-white/85"}`}><p className="whitespace-pre-wrap">{message.body}</p><p className="mt-1 text-[11px] opacity-60">{new Date(message.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</p></div>)}</div>
        <div className="mt-5 border-t border-white/10 pt-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">Suggested reply</p><div className="mt-2 whitespace-pre-wrap rounded-2xl border border-white/10 bg-black/20 p-4 text-sm leading-6 text-white/80">{suggestedReply || "No suggestion yet."}</div>{trackingLink ? <p className="mt-2 text-xs text-white/40">The link is tracked automatically so you can see what happens next.</p> : null}<div className="mt-3 flex flex-wrap gap-2"><form action="/api/admin/marketing/community/reply" method="post"><input type="hidden" name="conversation_id" value={selected.id}/><input type="hidden" name="reply" value={suggestedReply}/><button disabled={!suggestedReply || selected.risk_level === "red"} className="rounded-full bg-rose-600 px-4 py-2.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Send Suggested Reply</button></form><form action="/api/admin/marketing/community/take-over" method="post"><input type="hidden" name="conversation_id" value={selected.id}/><button className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold">Take Over</button></form><form action="/api/admin/marketing/community/close" method="post"><input type="hidden" name="conversation_id" value={selected.id}/><button className="rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold">Close</button></form></div></div></div>
        <aside className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/40">What happened next</p>{journey.length ? <ol className="mt-4 space-y-4">{journey.map((event:any)=><li key={event.id} className="relative border-l border-white/15 pl-4"><span className="absolute -left-1 top-1 h-2 w-2 rounded-full bg-rose-400"/><p className="text-sm font-medium">{journeyLabel(event.event_name || event.event_type || "Activity")}</p>{event.query ? <p className="mt-1 text-xs text-white/45">“{event.query}”</p> : null}<p className="mt-1 text-[11px] text-white/30">{new Date(event.occurred_at || event.created_at).toLocaleString("en-US", { timeZone: "America/New_York" })}</p></li>)}</ol> : <div className="mt-4 rounded-xl bg-white/[0.04] p-4 text-sm text-white/45">No TheOutHaven activity yet. If they use the tracked link, visits, searches, and outing actions will appear here.</div>}</aside></div></> : <div className="grid h-full place-items-center p-10 text-white/45">Choose a conversation.</div>}</section>
    </div>
  </AdminPageShell>;
}
