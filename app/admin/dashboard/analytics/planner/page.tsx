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

const FUNNEL_EVENTS = [
  "planner_started",
  "planner_intent_completed",
  "planner_where_when_completed",
  "planner_preferences_completed",
  "planner_generate_clicked",
] as const;

const LABELS: Record<(typeof FUNNEL_EVENTS)[number], string> = {
  planner_started: "Planner started",
  planner_intent_completed: "Step 1 · Plan completed",
  planner_where_when_completed: "Step 2 · Where & when completed",
  planner_preferences_completed: "Step 3 · Preferences completed",
  planner_generate_clicked: "Plans requested",
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
  const { data: events } = await supabaseAdmin
    .from("analytics_events")
    .select("event_name,created_at,metadata")
    .in("event_name", [...FUNNEL_EVENTS, "plan_text_sent", "external_reservation_confirmed", "external_reservation_not_completed"])
    .gte("created_at", since)
    .limit(20000);

  const rows = (events || []) as Array<{
    event_name?: string | null;
    created_at?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;

  const counts = Object.fromEntries(FUNNEL_EVENTS.map((name) => [name, 0])) as Record<(typeof FUNNEL_EVENTS)[number], number>;
  const planTypes = { outing: 0, restaurant: 0, activity: 0 };
  let textPlans = 0;
  let externalConfirmed = 0;
  let externalReturned = 0;

  for (const row of rows) {
    if (FUNNEL_EVENTS.includes(row.event_name as (typeof FUNNEL_EVENTS)[number])) {
      counts[row.event_name as (typeof FUNNEL_EVENTS)[number]] += 1;
    }
    if (row.event_name === "planner_intent_completed") {
      const planType = String(row.metadata?.plan_type || "");
      if (planType === "outing" || planType === "restaurant" || planType === "activity") {
        planTypes[planType] += 1;
      }
    }
    if (row.event_name === "plan_text_sent") textPlans += 1;
    if (row.event_name === "external_reservation_confirmed") externalConfirmed += 1;
    if (row.event_name === "external_reservation_not_completed") externalReturned += 1;
  }

  const starts = counts.planner_started;

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow="Guided Planner · Last 30 Days"
        title="Planner Funnel"
        subtitle="The new Step 1 → Step 2 → Step 3 planning journey. This replaces the old create-flow step reporting while keeping search-quality analytics separate."
        actions={
          <Link href="/admin/dashboard/analytics" className="rounded-full border border-white/10 bg-white/[0.05] px-4 py-2 text-xs font-black uppercase tracking-[0.1em] text-white/75">
            Platform Analytics
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {FUNNEL_EVENTS.map((eventName, index) => {
          const previous = index === 0 ? starts : counts[FUNNEL_EVENTS[index - 1]];
          return (
            <div key={eventName} className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">{LABELS[eventName]}</p>
              <p className="mt-2 text-3xl font-black text-white">{format(counts[eventName])}</p>
              <p className="mt-1 text-xs font-bold text-[#e1062a]">{index === 0 ? "Entry" : `${rate(counts[eventName], previous)} from prior step`}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">Step Conversion</p>
          <h2 className="mt-2 text-xl font-black text-white">Where users leave the planner</h2>
          <div className="mt-5 space-y-4">
            {FUNNEL_EVENTS.map((eventName) => {
              const value = counts[eventName];
              const width = starts ? Math.max(2, Math.round((value / starts) * 100)) : 0;
              return (
                <div key={eventName}>
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/65">
                    <span>{LABELS[eventName]}</span>
                    <span>{rate(value, starts)}</span>
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

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Plans texted</p><p className="mt-2 text-3xl font-black">{format(textPlans)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">External bookings confirmed</p><p className="mt-2 text-3xl font-black">{format(externalConfirmed)}</p></div>
        <div className="rounded-[1.25rem] border border-white/10 bg-[#101012] p-4"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">Returned · not booked</p><p className="mt-2 text-3xl font-black">{format(externalReturned)}</p></div>
      </section>
    </AdminPageShell>
  );
}
