import Link from "next/link";
import type { BusinessCRMRow } from "@/lib/admin-crm";
import { getCanonicalAppUrl } from "@/lib/site-url";

type Reservation = { id?: string; status?: string | null; reservation_date?: string | null; date?: string | null; starts_at?: string | null; created_at?: string | null };

function fmtDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function ReservationsPanel({ business, reservations }: { business: BusinessCRMRow; reservations: Reservation[]; canSend: boolean }) {
  const appUrl = getCanonicalAppUrl();
  const embedUrl = `${appUrl}/embed/reservations/${business.id}`;
  const publicUrl = `/embed/reservations/${business.id}`;
  const dashboardUrl = `/admin/dashboard/reservations?locationId=${business.id}`;
  const layoutUrl = `/admin/dashboard/reservations/location-layout?locationId=${business.id}`;
  const hasReserve = Boolean((business as any).reservation_embed_enabled || (business as any).reservation_enabled || business.reservation_url || business.external_reservation_url || business.plan === "pro" || business.is_pro);
  const upcoming = reservations.filter((r) => new Date(String(r.starts_at || r.reservation_date || r.date || r.created_at || 0)).getTime() >= Date.now()).length;
  const pending = reservations.filter((r) => String(r.status || "").toLowerCase().includes("pending")).length;
  const last = reservations.map((r) => r.starts_at || r.reservation_date || r.date || r.created_at).filter(Boolean).sort().at(-1);
  const iframe = `<iframe\n  src="${embedUrl}"\n  width="100%"\n  height="720"\n  style="border:0;border-radius:16px;overflow:hidden;"\n  loading="lazy"\n  title="TheOutHaven Reservations"\n></iframe>`;
  const subject = encodeURIComponent("Add your TheOutHaven reservation widget to your website");
  const body = encodeURIComponent(`Copy this iframe code and paste it into your website where you want your TheOutHaven reservation widget to appear.\n\n${iframe}\n\nQuestions? reserve@theouthaven.com`);

  return <section className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="text-xl font-black">Reservations</h2>
      <p className="mt-2 text-sm text-white/55">Manage reservation operations, public booking access, layout, and website embed code for this location.</p>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Stat label="Reserve status" value={hasReserve ? "Enabled" : "Needs setup"} />
        <Stat label="Plan support" value={business.plan === "pro" || business.is_pro ? "Reserve-ready" : "Review plan"} />
        <Stat label="Total reservations" value={reservations.length} />
        <Stat label="Upcoming" value={upcoming} />
        <Stat label="Pending" value={pending} />
        <Stat label="Last reservation" value={fmtDate(last)} />
      </div>
      {!hasReserve ? <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm text-amber-100">Missing setup: enable Reserve, add a reservation link, or upgrade the location plan before sharing the embed.</div> : null}
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={dashboardUrl} className="rounded-full bg-rose-600 px-4 py-2 text-sm font-black text-white">Open reservation dashboard</Link>
        <Link href={publicUrl} target="_blank" className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">View reservation page</Link>
        <Link href={layoutUrl} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Edit reservation layout</Link>
        <Link href={`/admin/dashboard/crm/${business.id}?tab=communication&channel=email&subject=${subject}&body=${body}`} className="rounded-full border border-white/10 px-4 py-2 text-sm font-bold text-white/70">Send embed code</Link>
      </div>
    </article>
    <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5">
      <h3 className="text-lg font-black">Website embed code</h3>
      <p className="mt-2 text-sm text-white/55">Copy this code and paste it into the location website where the TheOutHaven reservation widget should appear.</p>
      <textarea readOnly value={iframe} rows={9} className="mt-4 w-full rounded-2xl border border-white/10 bg-black/30 px-4 py-3 font-mono text-xs text-white outline-none" />
      <p className="mt-3 text-sm text-white/45">Reservation page URL: <span className="break-all text-white/70">{embedUrl}</span></p>
    </article>
  </section>;
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-2xl border border-white/10 bg-black/20 p-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-white/35">{label}</p><p className="mt-2 text-lg font-black text-white">{value}</p></div>;
}
