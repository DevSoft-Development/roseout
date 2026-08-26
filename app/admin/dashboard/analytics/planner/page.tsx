import { unstable_noStore as noStore } from "next/cache";
import Link from "next/link";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  AdminPageHeader,
  AdminPageShell,
  AdminSectionCard,
} from "@/components/admin/AdminDesignSystem";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const JOURNEY_EVENTS = [
  "planner_intent_completed",
  "planner_make_it_yours_completed",
  "planner_plan_selected",
  "planner_outing_completed",
] as const;

const LABELS: Record<(typeof JOURNEY_EVENTS)[number], string> = {
  planner_intent_completed: "1 · Plan",
  planner_make_it_yours_completed: "2 · Make It Yours",
  planner_plan_selected: "3 · Pick",
  planner_outing_completed: "4 · Complete Outing",
};

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

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const trackedEvents = [
    "planner_started",
    ...JOURNEY_EVENTS,
    "planner_results_viewed",
    "planner_pick_screen_viewed",
    "planner_pair_impression",
    "planner_build_own_opened",
    "planner_custom_pair_selected",
    "planner_custom_restaurant_selected",
    "planner_custom_activity_selected",
    "guided_plan_reservation_started",
    "guided_plan_texted",
    "guided_plan_emailed",
    "guided_plan_shared",
    "external_reservation_confirmed",
    "external_reservation_not_completed",
  ];

  const { data: events } = await supabaseAdmin
    .from("analytics_events")
    .select("event_name,created_at,metadata,source")
    .in("event_name", trackedEvents)
    .gte("created_at", since)
    .limit(40000);

  const rows = (events || []) as Array<{
    event_name?: string | null;
    created_at?: string | null;
    metadata?: Record<string, unknown> | null;
    source?: string | null;
  }>;

  const counts = Object.fromEntries(
    JOURNEY_EVENTS.map((name) => [name, 0]),
  ) as Record<(typeof JOURNEY_EVENTS)[number], number>;
  const planTypes = { outing: 0, restaurant: 0, activity: 0 };
  let starts = 0;
  let resultsViewed = 0;
  let reservationsStarted = 0;
  let textPlans = 0;
  let emailPlans = 0;
  let shares = 0;
  let externalConfirmed = 0;
  let externalReturned = 0;
  let topPickImpressions = 0;
  let sponsoredImpressions = 0;
  let organicPairImpressions = 0;
  let topPickSelections = 0;
  let sponsoredSelections = 0;
  let organicPairSelections = 0;
  let buildOwnOpened = 0;
  let customPairsUsed = 0;

  for (const row of rows) {
    const fromGuidedCreate = row.source === "guided_create";
    const fromGuidedPlan = row.source === "guided_plan_page";

    if (row.event_name === "planner_started" && fromGuidedCreate) starts += 1;
    if (
      fromGuidedCreate &&
      JOURNEY_EVENTS.includes(row.event_name as (typeof JOURNEY_EVENTS)[number])
    ) {
      counts[row.event_name as (typeof JOURNEY_EVENTS)[number]] += 1;
    }
    if (row.event_name === "planner_intent_completed" && fromGuidedCreate) {
      const planType = String(row.metadata?.plan_type || "");
      if (planType === "outing" || planType === "restaurant" || planType === "activity") {
        planTypes[planType] += 1;
      }
    }
    if (row.event_name === "planner_results_viewed" && fromGuidedCreate) resultsViewed += 1;

    if (row.event_name === "planner_pair_impression" && fromGuidedCreate) {
      const placement = String(row.metadata?.placement_group || "");
      if (placement === "sponsored") sponsoredImpressions += 1;
      else if (placement === "top_pick") topPickImpressions += 1;
      else if (placement === "organic") organicPairImpressions += 1;
    }

    if (row.event_name === "planner_plan_selected" && fromGuidedCreate) {
      const placement = String(row.metadata?.placement_group || "");
      if (placement === "sponsored") sponsoredSelections += 1;
      else if (placement === "top_pick") topPickSelections += 1;
      else if (placement === "organic") organicPairSelections += 1;
    }

    if (row.event_name === "planner_build_own_opened" && fromGuidedCreate) buildOwnOpened += 1;
    if (row.event_name === "planner_custom_pair_selected" && fromGuidedCreate) customPairsUsed += 1;
    if (row.event_name === "guided_plan_reservation_started" && fromGuidedPlan) reservationsStarted += 1;
    if (row.event_name === "guided_plan_texted" && fromGuidedPlan) textPlans += 1;
    if (row.event_name === "guided_plan_emailed" && fromGuidedPlan) emailPlans += 1;
    if (row.event_name === "guided_plan_shared" && fromGuidedPlan) shares += 1;
    if (row.event_name === "external_reservation_confirmed" && fromGuidedPlan) externalConfirmed += 1;
    if (row.event_name === "external_reservation_not_completed" && fromGuidedPlan) externalReturned += 1;
  }

  const funnel = [
    { key: "started", label: "Planner started", value: starts },
    ...JOURNEY_EVENTS.map((eventName) => ({
      key: eventName,
      label: LABELS[eventName],
      value: counts[eventName],
    })),
  ];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Guided Planner · Last 30 Days"
        title="Planner Funnel"
        subtitle="The customer journey follows four clear steps: Plan → Make It Yours → Pick → Complete Outing. Pick merchandising and custom-builder behavior are measured separately below."
        actions={
          <Link
            href="/admin/dashboard/analytics"
            className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-white/75"
          >
            Platform Analytics
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {funnel.map((item, index) => {
          const previous = index === 0 ? starts : funnel[index - 1].value;
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

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step Conversion</p>
          <h2 className="mt-2 text-xl font-black text-white">Where users leave the planner</h2>
          <div className="mt-5 space-y-4">
            {funnel.map((item) => {
              const width = starts ? Math.max(2, Math.round((item.value / starts) * 100)) : 0;
              return (
                <div key={item.key}>
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/65">
                    <span>{item.label}</span>
                    <span>{rate(item.value, starts)}</span>
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
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Plan Type</p>
          <h2 className="mt-2 text-xl font-black text-white">What customers ask for</h2>
          <div className="mt-4 space-y-3">
            {[
              ["Complete outing", planTypes.outing],
              ["Restaurant only", planTypes.restaurant],
              ["Activity only", planTypes.activity],
            ].map(([label, value]) => (
              <div key={String(label)} className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
                <span className="text-sm font-bold text-white/65">{label}</span>
                <b className="text-white">{format(Number(value))}</b>
              </div>
            ))}
          </div>
        </AdminSectionCard>
      </section>

      <AdminSectionCard className="p-5">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Pick Merchandising</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black text-white">TheOutHaven Top Picks, sponsored slots, and custom builds</h2>
            <p className="mt-1 text-sm font-semibold text-white/45">Sponsored metrics stay at zero until paid placement data is actually supplied and clearly labeled in the customer experience.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Top Pick impressions</p><p className="mt-2 text-2xl font-black">{format(topPickImpressions)}</p><p className="mt-1 text-xs font-bold text-white/40">{format(topPickSelections)} selected · {rate(topPickSelections, topPickImpressions)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Sponsored impressions</p><p className="mt-2 text-2xl font-black">{format(sponsoredImpressions)}</p><p className="mt-1 text-xs font-bold text-white/40">{format(sponsoredSelections)} selected · {rate(sponsoredSelections, sponsoredImpressions)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Organic pair impressions</p><p className="mt-2 text-2xl font-black">{format(organicPairImpressions)}</p><p className="mt-1 text-xs font-bold text-white/40">{format(organicPairSelections)} selected · {rate(organicPairSelections, organicPairImpressions)}</p></div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/40">Build my own</p><p className="mt-2 text-2xl font-black">{format(buildOwnOpened)}</p><p className="mt-1 text-xs font-bold text-white/40">{format(customPairsUsed)} custom pairs used</p></div>
        </div>
      </AdminSectionCard>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Pick screens viewed</p><p className="mt-2 text-3xl font-black">{format(resultsViewed)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Booking actions started</p><p className="mt-2 text-3xl font-black">{format(reservationsStarted)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">External bookings confirmed</p><p className="mt-2 text-3xl font-black">{format(externalConfirmed)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Returned · not booked</p><p className="mt-2 text-3xl font-black">{format(externalReturned)}</p></div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Plans texted</p><p className="mt-2 text-3xl font-black">{format(textPlans)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Plans emailed</p><p className="mt-2 text-3xl font-black">{format(emailPlans)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Plans shared</p><p className="mt-2 text-3xl font-black">{format(shares)}</p></div>
      </section>
    </AdminPageShell>
  );
}
