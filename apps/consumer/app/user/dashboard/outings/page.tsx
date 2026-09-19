import Link from "next/link";
import UserDashboardShell, { DashboardCard } from "@/components/user/UserDashboardShell";
import { EmptyState, CompactStatusBadge } from "@/components/ui/mobile";
import { getCurrentUserDashboardContext } from "@/lib/user-dashboard";

export const dynamic = "force-dynamic";

function label(status: unknown) {
  const value = typeof status === "string" && status ? status.replaceAll("_", " ") : "Planning";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function tone(status: unknown): "neutral" | "success" | "warning" | "danger" | "info" {
  const value = String(status || "").toLowerCase();
  if (value.includes("complete")) return "success";
  if (value.includes("cancel")) return "danger";
  if (value.includes("confirm") || value.includes("book") || value.includes("reservation")) return "info";
  return "neutral";
}

function Card({ outing }: { outing: any }) {
  const legacy = outing?.legacy_source === "user_outings";
  return (
    <DashboardCard className="flex h-full flex-col p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <CompactStatusBadge tone={tone(outing.status)}>{label(outing.status)}</CompactStatusBadge>
        <span className="text-xs font-bold text-white/35">
          {outing.completed_at ? new Date(outing.completed_at).toLocaleDateString() : outing.booked_at ? new Date(outing.booked_at).toLocaleDateString() : outing.created_at ? new Date(outing.created_at).toLocaleDateString() : "Saved"}
        </span>
      </div>
      <h2 className="mt-3 line-clamp-2 text-xl font-black">{outing.title || outing.restaurant_name || "TheOutHaven Outing"}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-white/60">{outing.restaurant_name || "Restaurant TBD"}{outing.activity_name ? ` + ${outing.activity_name}` : ""}</p>
      {legacy ? <p className="mt-3 text-xs font-semibold text-white/35">Imported from your earlier outing history.</p> : (
        <Link href={`/user/dashboard/outings/${outing.id}`} className="mt-auto inline-flex min-h-11 items-center justify-center rounded-full bg-white px-4 py-2 text-xs font-black text-black">View details</Link>
      )}
    </DashboardCard>
  );
}

function Section({ id, title, subtitle, outings, empty }: { id: string; title: string; subtitle: string; outings: any[]; empty: string }) {
  return (
    <section id={id} className="mt-8 scroll-mt-24">
      <p className="text-xs font-black uppercase tracking-[.25em] text-rose-200">{title}</p>
      <h2 className="mt-2 text-2xl font-black">{subtitle}</h2>
      {!outings.length ? <div className="mt-4"><EmptyState title={empty} message="Your outing history updates automatically as you move through the planning flow." /></div> : (
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{outings.map((outing: any) => <Card key={`${outing.legacy_source || "canonical"}-${outing.id}`} outing={outing} />)}</div>
      )}
    </section>
  );
}

export default async function Page() {
  const ctx = await getCurrentUserDashboardContext();
  const upcoming = ctx.bookedOutings || [];
  const completed = ctx.completedOutings || [];

  return (
    <UserDashboardShell isBeta={ctx.isBeta}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[.25em] text-rose-200">Outings</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-.04em] sm:text-4xl">My Outings</h1>
          <p className="mt-2 text-sm font-semibold text-white/60">Upcoming/booked outings and completed outings are kept separate here.</p>
        </div>
        <Link href="/create" className="inline-flex min-h-11 items-center justify-center rounded-full bg-rose-600 px-5 py-3 text-sm font-black">Create outing</Link>
      </div>

      <Section id="upcoming" title="Upcoming / Booked" subtitle="Plans in motion" outings={upcoming} empty="No upcoming outings yet" />
      <Section id="completed" title="Completed" subtitle="Past outings" outings={completed} empty="No completed outings yet" />
    </UserDashboardShell>
  );
}
