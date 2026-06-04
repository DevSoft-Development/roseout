import Link from "next/link";
import { ensureTeamProfileForCurrentUser } from "@/lib/team-tools";
import { listSupportTickets } from "@/lib/support";
import { SupportTicketWorkButtons } from "@/components/TeamToolsForms";

export const dynamic="force-dynamic";

export default async function TeamSupport(){
  const { user, profile } = await ensureTeamProfileForCurrentUser();
  if(!profile.can_work_support_tickets) return <main className="min-h-screen bg-[#080808] p-6 text-white"><Link href="/my-workspace">← My Workspace</Link><h1 className="mt-6 text-3xl font-black">Support work is not enabled for your profile.</h1></main>;
  const allTickets=await listSupportTickets(50);
  const tickets = ["experience_team", "support_team"].includes(String(profile.team_type))
    ? allTickets.filter((ticket) => ticket.assigned_admin_email && user.email && ticket.assigned_admin_email.toLowerCase() === user.email.toLowerCase())
    : allTickets;
  return <main className="min-h-screen bg-[#080808] px-4 py-8 text-white"><div className="mx-auto max-w-6xl"><Link href="/my-workspace" className="text-sm font-black text-rose-200">← My Workspace</Link><h1 className="mt-6 text-3xl font-black">My Support Work</h1><p className="mt-2 text-sm font-bold text-white/55">Existing ticket system only. No GPS/location and no proof images required. Experience and support team members only see tickets assigned to them.</p><div className="mt-6 grid gap-4">{tickets.map(t=><article key={t.id} className="rounded-3xl border border-white/10 bg-[#111] p-5"><div className="flex flex-wrap justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-rose-300">{t.ticket_number||t.id}</p><h2 className="mt-1 text-xl font-black">{t.subject}</h2><p className="mt-1 text-sm text-white/50">{t.requester_email} · {t.status}</p></div><Link href={`/support/tickets/${t.id}?key=${t.public_access_token}`} className="h-fit rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-xs font-black text-white/75">Open ticket</Link></div><div className="mt-4"><SupportTicketWorkButtons ticketId={t.id}/></div></article>)}{tickets.length===0?<div className="rounded-3xl border border-white/10 bg-[#111] p-5 text-sm font-bold text-white/55">No assigned support tickets are available for your workspace profile.</div>:null}</div></div></main>;
}
