import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { requireOwnerOrAdminAccessToLocation } from "@/lib/auth/locationOwnerAccess";
import { createLocationSupportTicketAction, replyToLocationSupportTicketAction } from "./actions";

export const dynamic = "force-dynamic";

const CATEGORIES = [
  "Location Support",
  "Billing",
  "Reservations",
  "Website / Domain",
  "Technical",
  "Account Access",
  "Marketing",
  "Analytics",
  "Listing Information",
];

export default async function LocationSupportPage({
  searchParams,
}: {
  searchParams?: Promise<{ ticket?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentLocation = await getCurrentBusinessLocation();
  if (!user?.id || !currentLocation?.id) {
    return <main className="min-h-screen bg-[#07090d] p-8 text-white"><div className="rounded-3xl border border-white/10 bg-white/[.04] p-6">No connected location account was found.</div></main>;
  }

  const access = await requireOwnerOrAdminAccessToLocation(user.id, String(currentLocation.id));
  if (!access) {
    return <main className="min-h-screen bg-[#07090d] p-8 text-white"><div className="rounded-3xl border border-white/10 bg-white/[.04] p-6">You do not have access to this location.</div></main>;
  }
  const location = access.location;

  const { data: tickets } = await supabaseAdmin
    .from("support_tickets")
    .select("id,ticket_number,subject,status,priority,category,created_at,updated_at,last_message_at")
    .eq("location_id", location.id)
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  const selectedId = params.ticket || tickets?.[0]?.id || null;
  const selected = selectedId
    ? await supabaseAdmin
        .from("support_tickets")
        .select("id,ticket_number,subject,status,priority,category,topic")
        .eq("id", selectedId)
        .eq("location_id", location.id)
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null } as any;
  const messages = selected.data
    ? await supabaseAdmin
        .from("support_ticket_messages")
        .select("id,author_name,sender_role,actor_type,body,message,created_at")
        .eq("ticket_id", selected.data.id)
        .eq("internal_note", false)
        .order("created_at")
    : { data: [] } as any;

  return (
    <main className="min-h-screen bg-[#07090d] p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="rounded-[2rem] border border-white/10 bg-white/[.04] p-6">
          <p className="text-xs font-black uppercase tracking-[.24em] text-[#ff6b86]">Location Support</p>
          <h1 className="mt-2 text-3xl font-black">Get help with your TheOutHaven location</h1>
          <p className="mt-2 text-sm font-bold text-white/50">Billing, reservations, website/domain, account access, marketing, analytics, listing information, and technical issues all route into the same support system used by TheOutHaven staff.</p>
        </header>

        <section className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-5">
            <form action={createLocationSupportTicketAction} className="space-y-3 rounded-3xl border border-white/10 bg-white/[.04] p-5">
              <h2 className="text-xl font-black">Create a ticket</h2>
              <select name="category" className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm font-bold">
                {CATEGORIES.map((category) => <option key={category}>{category}</option>)}
              </select>
              <input name="subject" required placeholder="What do you need help with?" className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
              <textarea name="message" required rows={6} placeholder="Tell us what happened and what you expected." className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
              <button className="w-full rounded-xl bg-[#e1062a] px-4 py-3 text-sm font-black">Submit support ticket</button>
            </form>

            <div className="rounded-3xl border border-white/10 bg-white/[.04] p-4">
              <h2 className="mb-3 text-lg font-black">Your tickets</h2>
              <div className="space-y-2">
                {(tickets || []).map((ticket: any) => (
                  <Link key={ticket.id} href={`/locations/dashboard/support?ticket=${ticket.id}`} className={`block rounded-xl border p-3 ${selectedId === ticket.id ? "border-[#ff2142]/50 bg-[#e1062a]/15" : "border-white/10 bg-black/20"}`}>
                    <p className="text-sm font-black">{ticket.subject}</p>
                    <p className="mt-1 text-xs font-bold text-white/45">{ticket.ticket_number || ticket.id} · {String(ticket.status || "open").replaceAll("_", " ")} · {ticket.priority || "normal"}</p>
                  </Link>
                ))}
                {!tickets?.length ? <p className="text-sm text-white/45">No support tickets yet.</p> : null}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[.04] p-5">
            {selected.data ? (
              <>
                <div className="border-b border-white/10 pb-4">
                  <p className="text-xs font-black uppercase tracking-[.2em] text-white/40">{selected.data.ticket_number || selected.data.id}</p>
                  <h2 className="mt-1 text-2xl font-black">{selected.data.subject}</h2>
                  <p className="mt-1 text-sm font-bold text-white/50">{String(selected.data.status || "open").replaceAll("_", " ")} · {selected.data.priority || "normal"} · {selected.data.category || selected.data.topic || "Support"}</p>
                </div>
                <div className="mt-5 space-y-3">
                  {(messages.data || []).map((message: any) => (
                    <div key={message.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs font-black uppercase tracking-[.16em] text-white/35">{message.author_name || message.sender_role || message.actor_type || "Support"}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{message.body || message.message}</p>
                    </div>
                  ))}
                </div>
                {selected.data.status !== "closed" ? (
                  <form action={replyToLocationSupportTicketAction} className="mt-5 space-y-2 border-t border-white/10 pt-5">
                    <input type="hidden" name="ticket_id" value={selected.data.id} />
                    <textarea name="message" required rows={5} placeholder="Reply to TheOutHaven Support..." className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-sm" />
                    <button className="rounded-xl bg-[#e1062a] px-4 py-2 text-sm font-black">Send reply</button>
                  </form>
                ) : <p className="mt-5 text-sm font-bold text-white/40">This ticket is closed. Create a new ticket if you need additional help.</p>}
                <p className="mt-4 text-xs font-bold text-white/35">Replies from TheOutHaven staff appear here and can also be delivered through the notification channels configured for the ticket.</p>
              </>
            ) : (
              <div className="grid min-h-[420px] place-items-center text-center text-white/45"><div><p className="text-lg font-black text-white/70">Select a support ticket</p><p className="mt-1 text-sm">Or create a new ticket to start a support conversation.</p></div></div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
