import QRCode from "qrcode";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function formatDate(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export default async function TicketPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{24,80}$/.test(token)) notFound();

  const { data: ticket, error } = await supabaseAdmin
    .from("event_tickets")
    .select("id,event_id,attendee_name,attendee_email,status,checked_in_at,public_token,events(title,venue_name,address,city,state,zip_code,starts_at,timezone,status)")
    .eq("public_token", token)
    .maybeSingle();

  if (error || !ticket) notFound();
  const eventRelation = Array.isArray(ticket.events) ? ticket.events[0] : ticket.events;
  const event = eventRelation as {
    title: string;
    venue_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip_code: string | null;
    starts_at: string;
    timezone: string;
    status: string;
  } | null;
  if (!event) notFound();

  const payload = `https://www.theouthaven.com/tickets/${token}`;
  const qrDataUrl = await QRCode.toDataURL(payload, { width: 420, margin: 2, errorCorrectionLevel: "M" });
  const address = [event.venue_name, event.address, event.city, event.state, event.zip_code].filter(Boolean).join(", ");

  return (
    <main className="min-h-screen bg-[#080706] px-4 py-10 text-white">
      <div className="mx-auto max-w-xl">
        <section className="overflow-hidden rounded-3xl border border-white/10 bg-[#12100f] shadow-2xl">
          <div className="border-b border-white/10 p-6 text-center">
            <p className="text-xs font-black uppercase tracking-[.26em] text-rose-300">TheOutHaven Admission</p>
            <h1 className="mt-2 text-3xl font-black">{event.title}</h1>
            <p className="mt-2 text-sm text-white/55">{formatDate(event.starts_at, event.timezone)}</p>
            {address ? <p className="mt-1 text-sm text-white/55">{address}</p> : null}
          </div>

          <div className="p-6 text-center">
            <div className="mx-auto inline-block rounded-3xl bg-white p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt={`QR admission ticket for ${event.title}`} className="h-72 w-72 max-w-full" />
            </div>
            <p className="mt-5 text-lg font-black">{ticket.attendee_name}</p>
            <p className="text-sm text-white/50">{ticket.attendee_email}</p>

            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4">
              {ticket.status === "valid" ? (
                <p className="font-black text-emerald-300">Valid ticket · Present this QR at entry</p>
              ) : ticket.status === "checked_in" ? (
                <p className="font-black text-amber-300">Checked in {ticket.checked_in_at ? new Date(ticket.checked_in_at).toLocaleString() : ""}</p>
              ) : (
                <p className="font-black text-red-300">This ticket is void and cannot be used</p>
              )}
            </div>

            <p className="mt-5 text-xs leading-5 text-white/40">
              Each QR code is unique. A ticket can be checked in only once. Do not publicly post or share your ticket QR.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
