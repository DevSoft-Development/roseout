import Link from "next/link";
import type { BusinessCRMRow } from "@/lib/admin-crm";
import { getEmbedStatus, getPartnerPlanDisplay, getReservationPortalStatus } from "@/lib/admin-crm";
import { getCanonicalAppUrl } from "@/lib/site-url";

type Reservation = { id?: string; status?: string | null; reservation_date?: string | null; date?: string | null; starts_at?: string | null; created_at?: string | null; guest_name?: string | null; party_size?: number | null };

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ReservationsPanel({ business, reservations, canSend }: { business: BusinessCRMRow; reservations: Reservation[]; canSend: boolean }) {
  const appUrl = getCanonicalAppUrl();
  const embedUrl = `${appUrl}/embed/reservations/${business.id}`;
  const publicUrl = `/embed/reservations/${business.id}`;
  const dashboardUrl = `/admin/dashboard/reservations?locationId=${business.id}`;
  const layoutUrl = `/admin/dashboard/reservations/location-layout?locationId=${business.id}`;
  const portalStatus = getReservationPortalStatus(business);
  const embedStatus = getEmbedStatus(business);
  const hasReserve = Boolean(
    ["partner_99", "pro", "reserve", "pro_reserve"].includes(String(business.plan || "")) ||
      ["active", "comped"].includes(String(business.plan_status || business.subscription_status || "")) ||
      business.is_pro ||
      (business as any).reservation_embed_enabled ||
      (business as any).reservation_enabled ||
      (business as any).internal_reservations_enabled ||
      (business as any).uses_internal_reservations,
  );
  const upcoming = reservations.filter((r) => new Date(String(r.starts_at || r.reservation_date || r.date || r.created_at || 0)).getTime() >= Date.now()).length;
  const pending = reservations.filter((r) => String(r.status || "").toLowerCase().includes("pending")).length;
  const last = reservations.map((r) => r.starts_at || r.reservation_date || r.date || r.created_at).filter(Boolean).sort().at(-1);
  const iframe = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="720"\n  style="border:0;border-radius:16px;overflow:hidden;"\n  loading="lazy"\n  title="TheOutHaven Reservations"\n></iframe>`;
  const subject = encodeURIComponent("Your TheOutHaven reservation widget");
  const body = encodeURIComponent(`Here is your TheOutHaven reservation embed code. Paste this into your website where you want guests to reserve. This connects to your TheOutHaven reservation portal and dashboard.\n\n${iframe}\n\nPortal link: ${embedUrl}\n\nIf you want help installing it, reply with your website page URL and we can help you test it.`);
  const checklist = ["Reservation portal enabled", "Availability set", "Party size rules set", "Business alerts set", "Confirmation tested", "Waitlist configured", "Modify/cancel tested", "Test reservation completed", "Embed code generated", "Embed sent", "Embed installed", "Embed tested", "Owner walkthrough done"];

  return <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-xl font-black">Standalone reservation portal + website embed</h2>
      <p className="mt-2 text-sm text-white/55">Businesses can place this embed on their own website and manage reservations through TheOutHaven.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Stat label="Reservation portal status" value={portalStatus.replace(/_/g, " ")} />
        <Stat label="Embed status" value={embedStatus.replace(/_/g, " ")} />
        <Stat label="Plan" value={getPartnerPlanDisplay(business)} />
        <Stat label="Total reservations" value={reservations.length} />
        <Stat label="Upcoming" value={upcoming} />
        <Stat label="Last reservation" value={fmtDate(last)} />
      </div>
      {!hasReserve || !["enabled", "tested", "live"].includes(portalStatus) ? <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-100">Warning: the embed code is shown for setup, but the reservation portal is not active/tested yet.</div> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={dashboardUrl} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">Reservation dashboard</Link>
        <Link href={layoutUrl} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Layout/resource setup</Link>
        <Link href={publicUrl} target="_blank" className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Test reservation portal</Link>
        <Link href={`/admin/dashboard/crm/${business.id}?tab=communication&channel=email&subject=${subject}&body=${body}`} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Send embed code action</Link>
      </div>
    </article>
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-lg font-black">Website embed code</h3>
      <p className="mt-2 text-sm text-white/55">Public embed URL: <span className="break-all text-white/75">{embedUrl}</span></p>
      <textarea readOnly value={iframe} rows={9} className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-white outline-none" />
      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/65"><p className="font-black text-white">Install instructions</p><ol className="mt-2 list-decimal space-y-1 pl-5"><li>Copy iframe code.</li><li>Paste into the business website where reservations should appear.</li><li>Save/publish the page.</li><li>Test a booking.</li><li>Confirm booking appears in the owner/admin reservation dashboard.</li></ol></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">{checklist.map((item) => <div key={item} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-xs font-bold text-white/65">□ {item}</div>)}</div>
    </article>
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h3 className="text-lg font-black">Reservation records</h3><p className="mt-1 text-sm text-white/55">Recent and upcoming bookings connected to this location.</p></div>
        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-black text-white/55">{canSend ? "Editable" : "Read only"}</span>
      </div>
      {reservations.length ? <div className="mt-4 grid gap-2">{reservations.slice(0, 12).map((reservation, index) => <div key={reservation.id || index} className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white/70 md:grid-cols-[1fr_auto_auto]"><div><p className="font-black text-white">{reservation.guest_name || "Reservation"}</p><p className="text-xs text-white/45">{fmtDate(reservation.starts_at || reservation.reservation_date || reservation.date || reservation.created_at)}</p></div><span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-black capitalize">{reservation.status || "scheduled"}</span><span className="text-xs font-bold text-white/55">Party {reservation.party_size || "—"}</span></div>)}</div> : <div className="mt-4 rounded-2xl border border-dashed border-white/15 bg-black/20 p-8 text-center"><h4 className="font-black text-white">No reservations yet</h4><p className="mt-2 text-sm text-white/55">Reservations will appear here after guests book through the portal or connected reservation tools.</p></div>}
    </article>
  </section>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{label}</p><p className="mt-2 text-lg font-black text-white">{value}</p></div>;
}
