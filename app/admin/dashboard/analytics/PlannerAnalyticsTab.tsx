import { supabaseAdmin } from "@/lib/supabase-admin";
import { AdminSectionCard } from "@/components/admin/AdminDesignSystem";

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

export default async function PlannerAnalyticsTab() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabaseAdmin
    .from("analytics_events")
    .select("event_name,created_at,metadata")
    .in("event_name", [
      ...FUNNEL_EVENTS,
      "plan_text_sent",
      "external_reservation_confirmed",
      "external_reservation_not_completed",
    ])
    .gte("created_at", since)
    .limit(20000);

  const rows = (events || []) as Array<{
    event_name?: string | null;
    created_at?: string | null;
    metadata?: Record<string, unknown> | null;
  }>;

  const counts = Object.fromEntries(
    FUNNEL_EVENTS.map((name) => [name, 0]),
  ) as Record<(typeof FUNNEL_EVENTS)[number], number>;
  const planTypes = { outing: 0, restaurant: 0, activity: 0 };
  let textPlans = 0;
  let externalConfirmed = 0;
  let externalReturned = 0;

  for (const row of rows) {
    if (
      FUNNEL_EVENTS.includes(
        row.event_name as (typeof FUNNEL_EVENTS)[number],
      )
    ) {
      counts[row.event_name as (typeof FUNNEL_EVENTS)[number]] += 1;
    }

    if (row.event_name === "planner_intent_completed") {
      const planType = String(row.metadata?.plan_type || "");
      if (
        planType === "outing" ||
        planType === "restaurant" ||
        planType === "activity"
      ) {
        planTypes[planType] += 1;
      }
    }

    if (row.event_name === "plan_text_sent") textPlans += 1;
    if (row.event_name === "external_reservation_confirmed") {
      externalConfirmed += 1;
    }
    if (row.event_name === "external_reservation_not_completed") {
      externalReturned += 1;
    }
  }

  const starts = counts.planner_started;
  const generated = counts.planner_generate_clicked;

  return (
    <div className="space-y-5">
      {error ? (
        <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 p-4 text-sm font-bold text-amber-100">
          Planner funnel data is temporarily unavailable. Other platform analytics
          are unaffected.
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {FUNNEL_EVENTS.map((eventName, index) => {
          const previous =
            index === 0 ? starts : counts[FUNNEL_EVENTS[index - 1]];

          return (
            <div
              key={eventName}
              className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4"
            >
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                {LABELS[eventName]}
              </p>
              <p className="mt-2 text-3xl font-black text-white">
                {format(counts[eventName])}
              </p>
              <p className="mt-1 text-xs font-bold text-[#e1062a]">
                {index === 0
                  ? "Entry"
                  : `${rate(counts[eventName], previous)} from prior step`}
              </p>
            </div>
          );
        })}
      </div>

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <AdminSectionCard className="p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">
                Guided Planner · Last 30 Days
              </p>
              <h3 className="mt-2 text-xl font-black text-white">
                Step conversion
              </h3>
              <p className="mt-1 text-sm font-semibold text-white/45">
                See where customers continue or leave the new three-step planner.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-black text-white/55">
              {rate(generated, starts)} start → plans
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {FUNNEL_EVENTS.map((eventName) => {
              const value = counts[eventName];
              const width = starts
                ? Math.max(2, Math.round((value / starts) * 100))
                : 0;

              return (
                <div key={eventName}>
                  <div className="flex items-center justify-between gap-3 text-xs font-bold text-white/65">
                    <span>{LABELS[eventName]}</span>
                    <span>{rate(value, starts)}</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#e1062a]"
                      style={{ width: `${Math.min(100, width)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </AdminSectionCard>

        <AdminSectionCard className="p-5">
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e1062a]">
            Plan Type
          </p>
          <h3 className="mt-2 text-xl font-black text-white">
            What customers ask for
          </h3>
          <p className="mt-1 text-sm font-semibold text-white/45">
            The mix selected in Step 1 of the guided planner.
          </p>

          <div className="mt-4 space-y-3">
            {[
              ["Complete outing", planTypes.outing],
              ["Restaurant only", planTypes.restaurant],
              ["Activity only", planTypes.activity],
            ].map(([label, value]) => (
              <div
                key={String(label)}
                className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/25 px-4 py-3"
              >
                <span className="text-sm font-bold text-white/65">{label}</span>
                <b className="text-white">{format(Number(value))}</b>
              </div>
            ))}
          </div>
        </AdminSectionCard>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
            Plans texted
          </p>
          <p className="mt-2 text-3xl font-black text-white">
            {format(textPlans)}
          </p>
          <p className="mt-1 text-xs font-semibold text-white/40">
            Secure plan links sent by SMS.
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
            External bookings confirmed
          </p>
          <p className="mt-2 text-3xl font-black text-white">
            {format(externalConfirmed)}
          </p>
          <p className="mt-1 text-xs font-semibold text-white/40">
            Customers who returned and confirmed they booked.
          </p>
        </div>
        <div className="rounded-[1.25rem] border border-white/10 bg-black/25 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
            Returned · not booked
          </p>
          <p className="mt-2 text-3xl font-black text-white">
            {format(externalReturned)}
          </p>
          <p className="mt-1 text-xs font-semibold text-white/40">
            External handoffs that did not become a confirmed booking.
          </p>
        </div>
      </section>
    </div>
  );
}
