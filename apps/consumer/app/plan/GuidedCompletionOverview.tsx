"use client";

import { useEffect, useMemo, useState } from "react";
import { getLocationName } from "@/lib/locationName";

type PlanLocation = Record<string, unknown> & { name?: string | null; restaurant_name?: string | null; activity_name?: string | null };
type SavedPlan = {
  restaurant?: PlanLocation | null;
  activity?: PlanLocation | null;
  outingTime?: {
    outingDateTimeText?: string | null;
    outingDateLabel?: string | null;
    outingTimeLabel?: string | null;
  } | null;
};
type ActiveOuting = {
  id?: string | null;
  mode?: "saved" | "booking" | string;
  summary?: { required?: number; confirmed?: number; complete?: boolean } | null;
};

const PLAN_KEY = "theouthaven_plan";
const ACTIVE_OUTING_KEY = "theouthaven_active_outing";

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export default function GuidedCompletionOverview() {
  const [plan, setPlan] = useState<SavedPlan | null>(null);
  const [active, setActive] = useState<ActiveOuting | null>(null);

  useEffect(() => {
    const refresh = () => {
      setPlan(readLocal<SavedPlan>(PLAN_KEY));
      setActive(readLocal<ActiveOuting>(ACTIVE_OUTING_KEY));
    };
    refresh();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 1200);
    return () => {
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);

  const names = useMemo(() => {
    const values = [
      plan?.restaurant ? getLocationName(plan.restaurant, "Restaurant") : null,
      plan?.activity ? getLocationName(plan.activity, "Activity") : null,
    ].filter((value): value is string => Boolean(value));
    return values;
  }, [plan]);

  const required = Math.max(0, Number(active?.summary?.required || 0));
  const confirmed = Math.max(0, Number(active?.summary?.confirmed || 0));
  const complete = Boolean(active?.summary?.complete && required > 0);
  const saved = Boolean(active?.id);
  const bookingStarted = active?.mode === "booking";
  const timing = plan?.outingTime?.outingDateTimeText || [plan?.outingTime?.outingDateLabel, plan?.outingTime?.outingTimeLabel].filter(Boolean).join(" · ") || null;

  const statusTitle = complete
    ? "Your tracked reservations are confirmed."
    : bookingStarted && required > 0
      ? `${Math.max(0, required - confirmed)} reservation${Math.max(0, required - confirmed) === 1 ? "" : "s"} still need attention.`
      : saved
        ? "Your outing is saved."
        : "Your outing is ready to finish.";

  const nextStep = complete
    ? "You’re set. Keep your plan handy for the outing."
    : bookingStarted
      ? "Use the reservation buttons below, then confirm each booking when you return."
      : "Start with the reservation buttons below. We’ll keep the plan together as you book.";

  return (
    <section className="mx-auto max-w-6xl px-4 pb-2 pt-6 sm:px-6 sm:pt-8">
      <div className="rounded-[1.5rem] border border-[#e1062a]/25 bg-[linear-gradient(135deg,rgba(225,6,42,0.11),rgba(255,255,255,0.025))] p-5 sm:p-6">
        <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff7188]">Your outing</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.03em]">{statusTitle}</h2>
            {names.length ? <p className="mt-2 text-sm font-bold text-white/70">{names.join(" + ")}</p> : null}
            {timing ? <p className="mt-1 text-sm font-semibold text-white/45">{timing}</p> : null}
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-white/50">{nextStep}</p>
          </div>

          <div className="grid min-w-[240px] gap-2 text-xs font-black">
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3.5 py-3"><span className="text-white/55">Plan chosen</span><span className="text-emerald-300">✓</span></div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3.5 py-3"><span className="text-white/55">Reservations</span><span className={complete ? "text-emerald-300" : "text-white/75"}>{required > 0 ? `${confirmed}/${required} confirmed` : bookingStarted ? "In progress" : "Next"}</span></div>
            <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/25 px-3.5 py-3"><span className="text-white/55">Plan saved</span><span className={saved ? "text-emerald-300" : "text-white/75"}>{saved ? "✓" : "When you start"}</span></div>
          </div>
        </div>
      </div>
    </section>
  );
}
