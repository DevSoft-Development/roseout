import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getPlannerFunnelSnapshot } from "@/lib/admin/planner-funnel";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
} from "@/components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function format(value: number) {
  return Intl.NumberFormat("en-US").format(value || 0);
}

function rate(value: number, base: number) {
  if (!base) return "0%";
  return `${Math.round((value / base) * 100)}%`;
}

export default async function PlannerAnalyticsPage() {
  noStore();
  await requireAdminRole(ADMIN_PAGE_ACCESS.analytics);
  const snapshot = await getPlannerFunnelSnapshot(30);
  const starts = snapshot.funnel[0]?.value || 0;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Guided Planner · Last 30 Days"
        title="Planner + Booking Funnel"
        subtitle="Track the full customer journey from planning through Book Plan, booking progress, outing readiness, and post-visit review activity."
        actions={
          <Link
            href="/admin/dashboard/analytics"
            className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-white/75"
          >
            Platform Analytics
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {snapshot.funnel.map((item, index) => {
          const previous = index === 0 ? starts : snapshot.funnel[index - 1]?.value || 0;
          return (
            <div key={item.key} className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{item.label}</p>
              <p className="mt-2 text-3xl font-black text-white">{format(item.value)}</p>
              <p className="mt-1 text-xs font-bold text-[#e1062a]">
                {index === 0 ? "Entry" : `${rate(item.value, previous)} from prior step`}
              </p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Full Funnel</p>
          <h2 className="mt-2 text-xl font-black text-white">Where customers leave the journey</h2>
          <p className="mt-1 text-sm font-semibold text-white/45">Book Plan is now the fourth planner step. Booking clicks are not counted as confirmations.</p>
          <div className="mt-5 space-y-4">
            {snapshot.funnel.map((item) => {
              const width = starts ? Math.max(2, Math.round((item.value / starts) * 100)) : 0;
              return (
                <div key={item.key}>
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/65">
                    <span>{item.label}</span>
                    <span>{format(item.value)} · {rate(item.value, starts)} of starts</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-[#e1062a]" style={{ width: `${Math.min(100, width)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Decision at Book Plan</p>
          <h2 className="mt-2 text-xl font-black text-white">Book now vs. save</h2>
          <div className="mt-4 space-y-3">
            <div className="rounded-2xl border border-[#e1062a]/25 bg-[#e1062a]/10 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#ff8da0]">Book Plan started</p>
              <p className="mt-1 text-3xl font-black text-white">{format(snapshot.bookPlanStarted)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Saved for later</p>
              <p className="mt-1 text-3xl font-black text-white">{format(snapshot.savedForLater)}</p>
            </div>
            <p className="text-xs font-semibold leading-5 text-white/40">This keeps saving separate from booking intent so the conversion funnel is not inflated by customers who only want to revisit a plan later.</p>
          </div>
        </AdminSectionCard>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Booking actions</p>
          <p className="mt-2 text-3xl font-black">{format(snapshot.bookingActionsStarted)}</p>
          <p className="mt-1 text-xs font-bold text-white/40">Reservation or ticket actions opened</p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Partially booked</p>
          <p className="mt-2 text-3xl font-black">{format(snapshot.partiallyBooked)}</p>
          <p className="mt-1 text-xs font-bold text-white/40">At least one required stop confirmed</p>
        </div>
        <div className="rounded-[1.25rem] border border-[#e1062a]/25 bg-[#e1062a]/10 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#ff8da0]">Outings ready</p>
          <p className="mt-2 text-3xl font-black">{format(snapshot.outingReady)}</p>
          <p className="mt-1 text-xs font-bold text-[#ff9daf]">All currently verifiable requirements complete</p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Returned · not booked</p>
          <p className="mt-2 text-3xl font-black">{format(snapshot.externalReturned)}</p>
          <p className="mt-1 text-xs font-bold text-white/40">External attempts marked unsuccessful</p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Pick Merchandising</p>
          <h2 className="mt-2 text-xl font-black text-white">Top Picks, sponsored slots, and custom builds</h2>
          <p className="mt-1 text-sm font-semibold text-white/45">Sponsored metrics remain zero until paid placement data is actually supplied and labeled in the customer experience.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Top Pick impressions</p><p className="mt-2 text-2xl font-black">{format(snapshot.topPickImpressions)}</p><p className="mt-1 text-xs font-bold text-white/40">{format(snapshot.topPickSelections)} selected · {rate(snapshot.topPickSelections, snapshot.topPickImpressions)}</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Sponsored impressions</p><p className="mt-2 text-2xl font-black">{format(snapshot.sponsoredImpressions)}</p><p className="mt-1 text-xs font-bold text-white/40">{format(snapshot.sponsoredSelections)} selected · {rate(snapshot.sponsoredSelections, snapshot.sponsoredImpressions)}</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Organic pair impressions</p><p className="mt-2 text-2xl font-black">{format(snapshot.organicPairImpressions)}</p><p className="mt-1 text-xs font-bold text-white/40">{format(snapshot.organicPairSelections)} selected · {rate(snapshot.organicPairSelections, snapshot.organicPairImpressions)}</p></div>
            <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Build my own</p><p className="mt-2 text-2xl font-black">{format(snapshot.buildOwnOpened)}</p><p className="mt-1 text-xs font-bold text-white/40">{format(snapshot.customPairsUsed)} custom pairs used</p></div>
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Plan Type</p>
          <h2 className="mt-2 text-xl font-black text-white">What customers ask for</h2>
          <div className="mt-4 space-y-3">
            {[
              ["Complete outing", snapshot.planTypes.outing],
              ["Restaurant only", snapshot.planTypes.restaurant],
              ["Activity only", snapshot.planTypes.activity],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <span className="text-sm font-bold text-white/65">{label}</span>
                <b className="text-white">{format(Number(value))}</b>
              </div>
            ))}
          </div>
        </AdminSectionCard>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Pick screens viewed</p><p className="mt-2 text-3xl font-black">{format(snapshot.resultsViewed)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">External confirmations</p><p className="mt-2 text-3xl font-black">{format(snapshot.externalConfirmed)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Post-visit confirmed</p><p className="mt-2 text-3xl font-black">{format(snapshot.postVisitConfirmed)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Outings reviewed</p><p className="mt-2 text-3xl font-black">{format(snapshot.reviewsSubmitted)}</p></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Plans texted</p><p className="mt-2 text-3xl font-black">{format(snapshot.textPlans)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Plans emailed</p><p className="mt-2 text-3xl font-black">{format(snapshot.emailPlans)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Plans shared</p><p className="mt-2 text-3xl font-black">{format(snapshot.shares)}</p></div>
      </section>
    </AdminPageShell>
  );
}
