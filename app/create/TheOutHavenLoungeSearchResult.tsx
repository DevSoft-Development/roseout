"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import GuidedJourneySteps from "@/components/planner/GuidedJourneySteps";

type DemoFixtureLocation = {
  id?: string | null;
  name?: string | null;
  restaurant_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  main_image?: string | null;
  image_url?: string | null;
  images?: string[] | string | null;
  publicViewHref?: string | null;
  locationDashboardHref?: string | null;
  reservationHref?: string | null;
  checkInHref?: string | null;
  feedbackHref?: string | null;
};

function imageFor(location: DemoFixtureLocation | null) {
  if (!location) return null;
  if (location.main_image) return location.main_image;
  if (location.image_url) return location.image_url;
  if (Array.isArray(location.images)) return location.images.find(Boolean) || null;
  if (typeof location.images === "string") {
    try {
      const parsed = JSON.parse(location.images);
      if (Array.isArray(parsed)) return parsed.find(Boolean) || null;
    } catch {
      return location.images.trim() || null;
    }
  }
  return null;
}

function addressFor(location: DemoFixtureLocation | null) {
  if (!location) return "";
  return [location.address, [location.city, location.state, location.zip_code].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(" · ");
}

export default function TheOutHavenLoungeSearchResult({ query }: { query: string }) {
  const [location, setLocation] = useState<DemoFixtureLocation | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError("");

        const searchResponse = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            input: query,
            query,
            message: query,
            prompt: query,
            selectedSearchLane: "restaurant",
            guidedFlow: "guided_create_v1",
          }),
        });
        const searchPayload = await searchResponse.json().catch(() => ({}));
        if (!searchResponse.ok || searchPayload?.diagnostics?.internal_demo_search !== true) {
          throw new Error("The protected Lounge search result is not available for this account.");
        }

        const fixtureResponse = await fetch("/api/admin/demo/theouthaven-lounge", {
          method: "GET",
          signal: controller.signal,
          cache: "no-store",
        });
        const fixturePayload = await fixtureResponse.json().catch(() => ({}));
        if (!fixtureResponse.ok || !fixturePayload?.location?.id) {
          throw new Error(fixturePayload?.error || "TheOutHaven Lounge could not be prepared.");
        }

        setLocation(fixturePayload.location);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : "TheOutHaven Lounge could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [query]);

  const image = imageFor(location);
  const address = addressFor(location);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#050505] pb-14 text-white">
      <section className="border-b border-white/10 bg-[radial-gradient(circle_at_top,rgba(225,6,42,0.18),transparent_36%),linear-gradient(180deg,#050505_0%,#090706_100%)] px-4 pb-8 pt-7 sm:px-6 sm:pb-10 sm:pt-10">
        <div className="mx-auto max-w-5xl">
          <p className="text-center text-[10px] font-black uppercase tracking-[0.24em] text-[#ff6b86]">Internal staff search</p>
          <h1 className="mt-3 text-center text-4xl font-black tracking-[-0.045em] sm:text-5xl">TheOutHaven Lounge</h1>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm font-semibold leading-6 text-white/55 sm:text-base">
            Protected end-to-end venue flow using the same production surfaces as a real location.
          </p>
          <GuidedJourneySteps activeStep={3} className="mx-auto mt-7 max-w-5xl" />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-7 sm:px-6 sm:py-10">
        {loading ? (
          <div className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-8 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[#e1062a]" />
            <p className="mt-4 text-sm font-bold text-white/60">Loading the protected Lounge result…</p>
          </div>
        ) : error ? (
          <div className="rounded-[1.5rem] border border-red-400/25 bg-red-500/10 p-6">
            <p className="text-sm font-black text-red-100">Unable to open the internal Lounge flow</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-red-100/70">{error}</p>
            <Link href="/create" className="mt-5 inline-flex rounded-full border border-white/15 px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-white">Back to planner</Link>
          </div>
        ) : location ? (
          <article className="overflow-hidden rounded-[1.75rem] border border-[#e1062a]/35 bg-[#0b0b0b] shadow-2xl shadow-black/40">
            <div className="grid lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="relative min-h-64 bg-white/[0.04] lg:min-h-[440px]">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={image} alt="TheOutHaven Lounge" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full min-h-64 items-center justify-center text-7xl">✨</div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                <span className="absolute bottom-5 left-5 rounded-full border border-white/15 bg-black/70 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-white">Protected demo venue</span>
              </div>

              <div className="flex flex-col p-6 sm:p-8">
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#e1062a] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white">Top Pick</span>
                  <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/55">Internal staff only</span>
                </div>
                <h2 className="mt-5 text-3xl font-black tracking-[-0.035em]">{location.name || location.restaurant_name || "TheOutHaven Lounge"}</h2>
                {address ? <p className="mt-2 text-sm font-semibold leading-6 text-white/50">{address}</p> : null}
                <p className="mt-5 text-sm font-semibold leading-6 text-white/70">
                  Continue through the actual location journey: profile, reservation, check-in, feedback, and the location operator dashboard.
                </p>

                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {location.publicViewHref ? <Link href={location.publicViewHref} className="rounded-full bg-[#e1062a] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-[#ff1744]">View Profile</Link> : null}
                  {location.reservationHref ? <Link href={location.reservationHref} className="rounded-full border border-white/15 bg-white/[0.05] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-white hover:text-black">Make Reservation</Link> : null}
                  {location.checkInHref ? <Link href={location.checkInHref} className="rounded-full border border-white/15 bg-white/[0.05] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-white hover:text-black">Check In</Link> : null}
                  {location.feedbackHref ? <Link href={location.feedbackHref} className="rounded-full border border-white/15 bg-white/[0.05] px-5 py-3.5 text-center text-xs font-black uppercase tracking-[0.08em] text-white hover:bg-white hover:text-black">Review / Feedback</Link> : null}
                </div>

                {location.locationDashboardHref ? (
                  <Link href={location.locationDashboardHref} className="mt-3 rounded-full border border-[#e1062a]/40 bg-[#e1062a]/12 px-5 py-4 text-center text-xs font-black uppercase tracking-[0.1em] text-rose-100 transition hover:bg-[#e1062a]/22">
                    Open Location Dashboard →
                  </Link>
                ) : null}

                <p className="mt-auto pt-7 text-[11px] font-semibold leading-5 text-white/35">
                  This result remains hidden from public search inventory and requires an approved internal demo role.
                </p>
              </div>
            </div>
          </article>
        ) : null}
      </section>
    </main>
  );
}
