import Link from "next/link";
import { getCurrentBusinessLocation } from "@/lib/growth-pro/data";
import { getBusinessOnboardingState } from "@/lib/business-onboarding";
import { updateOnboardingSkip } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function statusCopy(status: "complete" | "needs_setup" | "skipped") {
  if (status === "complete") return { label: "Complete", tone: "text-emerald-300 border-emerald-400/25 bg-emerald-400/10", marker: "✓" };
  if (status === "skipped") return { label: "Skipped for now", tone: "text-amber-200 border-amber-300/20 bg-amber-300/10", marker: "↷" };
  return { label: "Needs setup", tone: "text-white/55 border-white/10 bg-white/[0.04]", marker: "·" };
}

export default async function BusinessSetupHubPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const withQuery = (href: string) => query.size ? `${href}?${query.toString()}` : href;
  const location = await getCurrentBusinessLocation(typeof params.locationId === "string" ? params.locationId : undefined);
  const onboarding = location?.id ? await getBusinessOnboardingState(String(location.id)) : null;

  if (!onboarding) {
    return (
      <main className="min-h-screen bg-[#060708] px-4 py-8 text-white sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl rounded-[1.5rem] border border-[#e1062a]/25 bg-[#e1062a]/[0.055] p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff7188]">Business setup</p>
          <h1 className="mt-2 text-3xl font-black">Claim or add your location first.</h1>
          <p className="mt-2 text-sm font-semibold text-white/50">Once your location is connected, TheOutHaven will show exactly what is complete and what to do next.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/locations/signup" className="rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.08em]">Claim or add location</Link>
            <Link href="/locations/apply" className="rounded-full border border-white/10 px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white/70">Business application</Link>
          </div>
        </div>
      </main>
    );
  }

  const next = onboarding.nextBestAction;

  return (
    <main className="min-h-screen bg-[#060708] px-4 py-8 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#ff5f7a]">Business setup</p>
            <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] sm:text-4xl">Get {onboarding.locationName} ready for customers.</h1>
            <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/50">Complete the essentials in order. Reservations and Events & Experiences can be skipped for now and finished later.</p>
          </div>
          <Link href={withQuery("/locations/dashboard")} className="rounded-full border border-white/10 px-4 py-2.5 text-xs font-black text-white/65">Back to dashboard</Link>
        </div>

        <section className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className={`rounded-[1.5rem] border p-5 sm:p-6 ${onboarding.readyForCustomers ? "border-emerald-400/25 bg-emerald-400/[0.06]" : "border-[#e1062a]/25 bg-[#e1062a]/[0.055]"}`}>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#ff7188]">Next best action</p>
            <h2 className="mt-1 text-2xl font-black">{onboarding.readyForCustomers ? "You’re ready for customers." : next?.title || "Setup is resolved."}</h2>
            <p className="mt-2 text-sm font-semibold text-white/50">{onboarding.readyForCustomers ? "Your required setup is complete. Skipped optional steps remain available below whenever you want to finish them." : next?.description || "Review any skipped steps whenever you are ready."}</p>
            {next ? <Link href={withQuery(next.href)} className="mt-5 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.08em]">{next.action} →</Link> : <Link href={withQuery("/locations/dashboard")} className="mt-5 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.08em]">Go to dashboard →</Link>}
          </div>

          <aside className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Readiness</p>
            <div className="mt-2 flex items-end gap-2"><p className="text-4xl font-black">{onboarding.readinessPercent}%</p><p className="pb-1 text-xs font-bold text-white/35">resolved</p></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-[#e1062a]" style={{ width: `${onboarding.readinessPercent}%` }} /></div>
            <p className="mt-4 text-xs font-semibold leading-5 text-white/40">{onboarding.completionPercent}% fully completed. Skipped steps count as resolved for launch readiness, but remain unfinished until you return to them.</p>
          </aside>
        </section>

        <section className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {onboarding.steps.map((step, index) => {
            const status = statusCopy(step.status);
            return (
              <article key={step.key} className="flex flex-col rounded-[1.35rem] border border-white/10 bg-white/[0.035] p-5">
                <div className="flex items-center justify-between gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#e1062a] text-sm font-black">{index + 1}</span>
                  <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] ${status.tone}`}>{status.marker} {status.label}</span>
                </div>
                <h2 className="mt-4 text-lg font-black">{step.title}</h2>
                <p className="mt-2 flex-1 text-sm font-semibold leading-6 text-white/45">{step.description}</p>
                <Link href={withQuery(step.href)} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full bg-white/[0.06] px-4 text-xs font-black text-white/80 transition hover:bg-white/[0.1]">{step.status === "complete" ? "Open" : step.status === "skipped" ? "Complete later" : step.action} →</Link>
                {step.optional && step.status !== "complete" ? (
                  <form action={updateOnboardingSkip} className="mt-2">
                    <input type="hidden" name="location_id" value={onboarding.locationId} />
                    <input type="hidden" name="step" value={step.key} />
                    <input type="hidden" name="skipped" value={step.status === "skipped" ? "0" : "1"} />
                    <button type="submit" className="w-full rounded-full border border-white/10 px-4 py-2.5 text-xs font-black text-white/45 transition hover:bg-white/[0.04] hover:text-white/70">{step.status === "skipped" ? "Put back in setup" : "Skip for now"}</button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </section>

        <section className={`mt-8 rounded-[1.35rem] border p-5 ${onboarding.readyForCustomers ? "border-emerald-400/20 bg-emerald-400/[0.045]" : "border-white/10 bg-white/[0.02]"}`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-white/35">Final status</p><h2 className="mt-1 text-xl font-black">{onboarding.readyForCustomers ? "Ready to accept customers" : "Finish the next required item"}</h2></div>
            <Link href={onboarding.readyForCustomers ? withQuery("/locations/dashboard") : withQuery(next?.href || "/locations/dashboard/business-setup")} className="rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.08em]">{onboarding.readyForCustomers ? "Open dashboard" : next?.action || "Review setup"} →</Link>
          </div>
        </section>

        <details className="mt-8 rounded-[1.35rem] border border-white/10 bg-white/[0.02] p-5">
          <summary className="cursor-pointer list-none text-sm font-black text-white/70">Advanced business tools <span className="float-right text-white/30">+</span></summary>
          <p className="mt-2 text-sm font-semibold text-white/40">Use these whenever you need them; they do not block launch readiness.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Link href={withQuery("/locations/dashboard/branding")} className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="font-black">Branding</p><p className="mt-1 text-xs font-semibold text-white/40">Logo, imagery, and visual identity.</p></Link>
            <Link href={withQuery("/locations/dashboard/domains")} className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="font-black">Domain</p><p className="mt-1 text-xs font-semibold text-white/40">Connect or manage your website domain.</p></Link>
            <Link href={withQuery("/locations/dashboard/qr-codes")} className="rounded-2xl border border-white/10 bg-black/25 p-4"><p className="font-black">QR Codes</p><p className="mt-1 text-xs font-semibold text-white/40">Create QR codes for menus, bookings, events, and reviews.</p></Link>
          </div>
        </details>
      </div>
    </main>
  );
}
