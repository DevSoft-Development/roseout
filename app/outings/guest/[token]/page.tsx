async function getPlan(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/outings/guest/${token}`, { cache: "no-store" });
  return res.json();
}

function locationName(outing: any) {
  return outing?.locations?.name || outing?.locations?.restaurant_name || outing?.locations?.activity_name || "Your selected place";
}

export default async function GuestOutingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getPlan(token);
  if (!result.ok) return <main className="mx-auto max-w-3xl p-8"><h1 className="text-3xl font-bold">Plan link unavailable</h1><p>This secure plan link is invalid or expired.</p></main>;
  const outing = result.outing;
  const isExact = outing.outing_time_confidence === "exact" && outing.planned_for;
  const isDateOnly = outing.outing_time_confidence === "date_only";
  return (
    <main className="min-h-screen bg-[#12070a] px-6 py-10 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="rounded-3xl border border-white/10 bg-white/[0.04] p-8">
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-rose-200">Your Outing Plan</p>
          <h1 className="mt-3 text-4xl font-black">{locationName(outing)}</h1>
          <p className="mt-3 rounded-full border border-white/10 px-4 py-2 text-sm inline-flex">{outing.status || "planned"}</p>
        </header>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-black">Outing time & follow-up</h2>
          {isExact ? <p className="mt-3 text-white/75">We can remind you before your outing and check in tomorrow to see how everything went.</p> : null}
          {isDateOnly ? <div className="mt-3 space-y-2 text-white/75"><p>You said: {outing.outing_date_context}.</p><p>Pre-outing reminders need an exact time.</p><p>We’ll check in tomorrow to see how everything went.</p></div> : null}
          {!isExact && !isDateOnly ? <p className="mt-3 text-white/75">Add a date or time if you want reminders or follow-up.</p> : null}
          <div className="mt-5 flex flex-wrap gap-3"><button className="rounded-full bg-rose-500 px-5 py-3 font-bold">Add exact time</button><button className="rounded-full border border-white/15 px-5 py-3 font-bold">Share</button><button className="rounded-full border border-white/15 px-5 py-3 font-bold">Add to calendar</button></div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-black">Place details</h2>
          <p className="mt-2 text-white/75">{outing.locations?.address || "Address details will appear here when available."}</p>
          <div className="mt-5 flex flex-wrap gap-3"><a className="rounded-full bg-white px-5 py-3 font-bold text-black" href={outing.locations?.external_reservation_url || outing.locations?.website || "#"}>Open reservation site</a><a className="rounded-full border border-white/15 px-5 py-3 font-bold" href={outing.locations?.website || "#"}>Open website</a><a className="rounded-full border border-white/15 px-5 py-3 font-bold" href={`tel:${outing.locations?.phone || ""}`}>Call location</a></div>
        </section>
        <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-2xl font-black">How did everything go?</h2>
          <p className="mt-2 text-white/75">We’ll send a follow-up link when it’s time.</p>
          {outing.attendance_confirmed_at ? <p className="mt-3 font-bold text-emerald-200">Thanks for letting us know.</p> : null}
        </section>
      </div>
    </main>
  );
}
