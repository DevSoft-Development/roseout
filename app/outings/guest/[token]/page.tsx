import GuestOutingTimeEditor from "@/components/outings/GuestOutingTimeEditor";

async function getPlan(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const res = await fetch(`${base}/api/outings/guest/${token}`, { cache: "no-store" });
  return res.json();
}

function placeName(place: any, fallback: string) {
  return place?.name || place?.restaurant_name || place?.activity_name || fallback;
}

function placeImage(place: any) {
  return place?.main_image || place?.image_url || null;
}

function placeMeta(place: any, type: "restaurant" | "activity") {
  return [
    type === "restaurant" ? place?.cuisine || place?.cuisine_type || "Restaurant" : place?.activity_type || place?.primary_category || "Activity",
    place?.city,
    place?.rating || place?.google_rating ? `★ ${Number(place?.rating || place?.google_rating).toFixed(1)}` : null,
  ].filter(Boolean).join(" · ");
}

function PlaceCard({ place, type }: { place: any; type: "restaurant" | "activity" }) {
  if (!place) return null;
  const image = placeImage(place);
  const booking = place.external_reservation_url || place.reservation_url || place.booking_url || null;
  return (
    <article className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.04]">
      <div className="relative h-56 bg-white/[0.035] sm:h-72">
        {image ? <img src={image} alt={placeName(place, type)} className="absolute inset-0 h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-5xl">{type === "restaurant" ? "🍽️" : "✨"}</div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/10" />
        <span className="absolute bottom-4 left-4 rounded-full border border-white/10 bg-black/75 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em]">{type}</span>
      </div>
      <div className="p-5 sm:p-6">
        <h2 className="text-2xl font-black tracking-[-0.025em]">{placeName(place, type)}</h2>
        <p className="mt-1 text-sm font-semibold text-white/50">{placeMeta(place, type)}</p>
        {place.address ? <p className="mt-3 text-sm font-semibold text-white/65">{place.address}</p> : null}
        <div className="mt-5 flex flex-wrap gap-2">
          {booking ? <a className="rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.08em]" href={booking} target="_blank" rel="noopener noreferrer">{type === "restaurant" ? "Reserve" : "Book"}</a> : null}
          {place.website ? <a className="rounded-full border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white/75" href={place.website} target="_blank" rel="noopener noreferrer">Website</a> : null}
          {place.phone ? <a className="rounded-full border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-[0.08em] text-white/75" href={`tel:${place.phone}`}>Call</a> : null}
        </div>
      </div>
    </article>
  );
}

export default async function GuestOutingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getPlan(token);
  if (!result.ok) {
    return (
      <main className="min-h-screen bg-[#050505] px-6 py-24 text-white">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center">
          <h1 className="text-3xl font-black">Plan link unavailable</h1>
          <p className="mt-3 text-white/55">This secure plan link is invalid or expired.</p>
          <a href="/create" className="mt-6 inline-flex rounded-full bg-[#e1062a] px-5 py-3 text-xs font-black uppercase tracking-[0.08em]">Create a new outing</a>
        </div>
      </main>
    );
  }

  const outing = result.outing;
  const isExact = outing.outing_time_confidence === "exact" && outing.planned_for;
  const isDateOnly = outing.outing_time_confidence === "date_only";
  const shortCode = typeof outing.metadata?.short_code === "string" ? outing.metadata.short_code : null;
  const plannerSnapshot = outing.metadata?.planner_snapshot || null;
  const canViewOtherPicks = Boolean(shortCode && (plannerSnapshot?.pair_ids?.length || plannerSnapshot?.result_ids?.length));
  const planTitle = outing.plan_title || [placeName(outing.restaurant, ""), placeName(outing.activity, "")].filter(Boolean).join(" + ") || "Your TheOutHaven Plan";

  return (
    <main className="min-h-screen bg-[#050505] px-4 pb-16 pt-24 text-white sm:px-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[1.75rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(225,6,42,0.2),transparent_36%),#0b0b0c] p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#ff7188]">Your Outing Plan</p>
              <h1 className="mt-3 max-w-4xl text-3xl font-black tracking-[-0.04em] sm:text-5xl">{planTitle}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-white/55">{outing.status || "planned"}</span>
                {isExact ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/70">{new Date(outing.planned_for).toLocaleString()}</span> : null}
                {isDateOnly && outing.outing_date_context ? <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-white/70">{outing.outing_date_context}</span> : null}
              </div>
            </div>
            {canViewOtherPicks ? <a href={`/p/${encodeURIComponent(shortCode)}?view=picks`} className="inline-flex shrink-0 items-center justify-center rounded-full border border-[#e1062a]/40 bg-[#e1062a]/10 px-5 py-3.5 text-xs font-black uppercase tracking-[0.08em] text-[#ff8ca0] transition hover:bg-[#e1062a]/20">← View Other Picks</a> : null}
          </div>
        </header>

        <section className={`grid gap-5 ${outing.restaurant && outing.activity ? "lg:grid-cols-2" : "max-w-2xl"}`}>
          <PlaceCard place={outing.restaurant} type="restaurant" />
          <PlaceCard place={outing.activity} type="activity" />
          {!outing.restaurant && !outing.activity && outing.locations ? <PlaceCard place={outing.locations} type={outing.location_type === "activity" ? "activity" : "restaurant"} /> : null}
        </section>

        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6 sm:p-7">
          <h2 className="text-2xl font-black">Outing time & reminders</h2>
          {isExact ? <p className="mt-3 text-sm font-semibold text-white/55">Your date and time are set. TheOutHaven Concierge can keep your plan handy and send the reminders you choose.</p> : null}
          {isDateOnly ? <div className="mt-3 space-y-1 text-sm font-semibold text-white/55"><p>You said: {outing.outing_date_context}.</p><p>Add an exact time if you want pre-outing reminders.</p></div> : null}
          {!isExact && !isDateOnly ? <p className="mt-3 text-sm font-semibold text-white/55">Add a date and time if you want TheOutHaven to help keep this outing organized.</p> : null}
          <div className="mt-5">
            <GuestOutingTimeEditor
              token={token}
              initialValue={{
                plannedFor: outing.planned_for,
                timezone: outing.timezone || "America/New_York",
                outingDateContext: outing.outing_date_context,
                outingTimeConfidence: outing.outing_time_confidence || "none",
                remindersEnabled: Boolean(outing.reminders_enabled),
                nextMorningFollowupEnabled: Boolean(outing.next_morning_followup_enabled),
                nextMorningFollowupDate: outing.next_morning_followup_date,
              }}
              initialEmail={outing.guest_email}
              initialName={outing.guest_name}
              initialPhone={outing.guest_phone}
              initialEmailOptIn={outing.email_opt_in}
              initialSmsOptIn={outing.sms_opt_in}
            />
          </div>
        </section>

        <section className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-6 sm:p-7">
          <h2 className="text-2xl font-black">How did everything go?</h2>
          <p className="mt-2 text-sm font-semibold text-white/55">After your outing, TheOutHaven can check in so you can tell us how the picks worked out.</p>
          {outing.attendance_confirmed_at ? <p className="mt-3 font-bold text-emerald-200">Thanks for letting us know.</p> : null}
        </section>
      </div>
    </main>
  );
}
