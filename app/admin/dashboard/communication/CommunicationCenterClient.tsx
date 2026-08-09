"use client";

import { useEffect, useMemo, useState } from "react";

type Template = { id: string; name: string; channel: "email" | "sms"; subject: string | null; body: string };
type SearchUser = { id: string; full_name?: string | null; email?: string | null; phone?: string | null };
type SearchLocation = { id: string; location_type: string; name: string; city?: string | null; state?: string | null; contact_email?: string | null; email?: string | null; contact_phone?: string | null; phone?: string | null };
type SupportTicket = { id: string; ticket_number?: string | null; requester_email?: string | null; subject?: string | null; status?: string | null; priority?: string | null; last_message_at?: string | null };
type SearchResponse = { users?: SearchUser[]; locations?: SearchLocation[] };

export default function CommunicationCenterClient() {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState<{ users: SearchUser[]; locations: SearchLocation[] }>({ users: [], locations: [] });
  const [channel, setChannel] = useState<"email" | "sms">("email");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);

  useEffect(() => {
    fetch("/api/admin/communication/templates").then((r) => r.json()).then((d) => setTemplates(d.templates || []));
    fetch("/api/admin/support-tickets").then((r) => r.json()).then((d) => setTickets(d.tickets || []));
  }, []);
  useEffect(() => {
    if (query.trim().length < 2) {
      setSearch({ users: [], locations: [] });
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/admin/communication/search?q=${encodeURIComponent(query)}`)
        .then((r) => r.json())
        .then((data: SearchResponse) => setSearch({ users: data.users || [], locations: data.locations || [] }));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const filteredTemplates = useMemo(() => templates.filter((t) => t.channel === channel), [templates, channel]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    if (channel === "email") setSubject(t.subject || "");
    setBody(t.body || "");
  };

  return (
    <main className="min-h-screen bg-[#090706] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-[1.5rem] border border-white/10 bg-[#120d0b] p-6 shadow-2xl"><h1 className="text-3xl font-black">Communication Center</h1><p className="text-white/70">Search users, locations, send messages, and manage Experience Inbox conversations.</p></section>
        <section className="grid gap-4 md:grid-cols-4">{[{k:"Emails sent",v:"—"},{k:"SMS sent",v:"—"},{k:"Open tickets",v:String(tickets.filter((t)=>t.status==="open").length)},{k:"Waiting replies",v:String(tickets.filter((t)=>t.status==="waiting_on_customer").length)}].map((s)=><div key={s.k} className="rounded-[1.5rem] border border-white/10 bg-[#1b1210] p-4 shadow-2xl"><p className="text-xs uppercase text-rose-200/70">{s.k}</p><p className="text-2xl font-black text-rose-100">{s.v}</p></div>)}</section>
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-[1.5rem] border border-white/10 bg-[#120d0b] p-6 shadow-2xl"><h2 className="font-black">Live Search</h2><input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="Search users, restaurants, activities, locations" className="mt-3 w-full rounded-xl border border-white/10 bg-[#1b1210] px-3 py-2 placeholder:text-white/40" /><div className="mt-4 space-y-4"><div><p className="text-sm font-semibold text-rose-200">Users</p>{search.users.map((u)=><button key={u.id} onClick={()=>setTo(u.email || u.phone || "")} className="mt-2 block w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left hover:bg-white/[0.04]"><p>{u.full_name || "Unnamed"}</p><p className="text-xs text-white/60">{u.email} · {u.phone}</p></button>)}</div><div><p className="text-sm font-semibold text-rose-100">Locations</p>{search.locations.map((l)=><button key={`${l.location_type}-${l.id}`} onClick={()=>setTo(l.contact_email || l.email || l.contact_phone || l.phone || "")} className="mt-2 block w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-left hover:bg-white/[0.04]"><p>{l.name}</p><p className="text-xs text-white/60">{l.location_type} · {l.city} {l.state} · {l.contact_email || l.email} · {l.contact_phone || l.phone}</p></button>)}</div></div></section>
          <section className="rounded-[1.5rem] border border-white/10 bg-[#120d0b] p-6 shadow-2xl"><h2 className="font-black">Compose</h2><div className="mt-3 grid gap-3"><select value={channel} onChange={(e)=>setChannel(e.target.value as "email"|"sms")} className="rounded-xl border border-white/10 bg-[#1b1210] px-3 py-2"><option value="email">Email</option><option value="sms">SMS</option></select><input value={to} onChange={(e)=>setTo(e.target.value)} placeholder="Recipient email or phone" className="rounded-xl border border-white/10 bg-[#1b1210] px-3 py-2 placeholder:text-white/40" />{channel==="email" && <input value={subject} onChange={(e)=>setSubject(e.target.value)} placeholder="Subject" className="rounded-xl border border-white/10 bg-[#1b1210] px-3 py-2 placeholder:text-white/40" />}<select value={templateId} onChange={(e)=>applyTemplate(e.target.value)} className="rounded-xl border border-white/10 bg-[#1b1210] px-3 py-2"><option value="">Select template</option>{filteredTemplates.map((t)=><option key={t.id} value={t.id}>{t.name}</option>)}</select><textarea value={body} onChange={(e)=>setBody(e.target.value)} rows={8} className="rounded-xl border border-white/10 bg-[#1b1210] px-3 py-2 placeholder:text-white/40" /><div className="flex gap-2"><button onClick={async()=>{await fetch('/api/admin/communication/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({channel,to,subject,body})});}} className="rounded-xl border border-rose-300/20 bg-gradient-to-r from-rose-900/45 to-rose-900/35 px-4 py-2 text-rose-100 shadow-[0_0_25px_rgba(244,63,94,0.12)]">Send</button><button onClick={async()=>{await fetch('/api/admin/communication/templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`Custom ${new Date().toISOString()}`,channel,subject,body})});}} className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2">Save as template</button></div></div></section>
        </div>
        <section className="rounded-[1.5rem] border border-white/10 bg-[#120d0b] p-6 shadow-2xl"><h2 className="font-black">Experience Inbox</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="text-left text-white/60"><th>Ticket #</th><th>Requester</th><th>Subject</th><th>Status</th><th>Priority</th><th>Last reply</th></tr></thead><tbody>{tickets.map((t)=><tr key={t.id} className="border-t border-white/10"><td className="py-2">{t.ticket_number}</td><td>{t.requester_email}</td><td>{t.subject}</td><td>{t.status}</td><td>{t.priority}</td><td>{t.last_message_at}</td></tr>)}</tbody></table></div></section>
      </div>
    </main>
  );
}
