"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import BuildYourOwnOuting from "./BuildYourOwnOuting";
import CreatePageLegacy from "./CreatePageLegacy";

type AnchorLocation = {
  id?: string | number | null;
  name?: string | null;
  restaurant_name?: string | null;
  activity_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  borough?: string | null;
  location_type?: string | null;
  primary_category?: string | null;
  activity_type?: string | null;
  image_url?: string | null;
  main_image?: string | null;
  images?: string[] | string | null;
};

type DemoFixtureLocation = AnchorLocation & {
  publicViewHref: string;
  locationDashboardHref: string;
  reservationHref: string;
  reviewHref: string;
};

type AnchorSearchContext = {
  mode?: string | null;
  heading?: string | null;
  anchor_position?: string | null;
  anchorRequested?: boolean;
  anchorResolved?: boolean;
  anchorRelationship?: string | null;
};

type AnchorState = {
  location: AnchorLocation;
  context: AnchorSearchContext | null;
};

type BuilderState = {
  enabled?: boolean;
  restaurants?: AnchorLocation[];
  activities?: AnchorLocation[];
};

function locationName(location: AnchorLocation) {
  return (
    location.name ||
    location.restaurant_name ||
    location.activity_name ||
    "Selected location"
  );
}

function locationImage(location: AnchorLocation) {
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

function locationAddress(location: AnchorLocation) {
  const locality = [location.city, location.state, location.zip_code]
    .filter(Boolean)
    .join(", ");
  return [location.address, locality].filter(Boolean).join(" · ");
}

function normalizeFixtureQuery(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function requestSearchText(args: Parameters<typeof window.fetch>) {
  try {
    const init = args[1];
    if (!init?.body || typeof init.body !== "string") return "";
    const body = JSON.parse(init.body);
    const direct = body.input || body.query || body.message || body.prompt;
    if (typeof direct === "string") return direct;
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const last = messages[messages.length - 1];
    return typeof last?.content === "string" ? last.content : "";
  } catch {
    return "";
  }
}

function isTheOutHavenLoungeQuery(value: unknown) {
  const normalized = normalizeFixtureQuery(value);
  return normalized === "theouthaven lounge" || normalized === "the out haven lounge";
}

function findResultsSection() {
  return Array.from(document.querySelectorAll("section")).find((section) => {
    const className = section.getAttribute("class") || "";
    return (
      className.includes("max-w-7xl") &&
      className.includes("overflow-x-hidden") &&
      className.includes("py-6")
    );
  });
}

function AnchorContextCard({ state }: { state: AnchorState }) {
  const { location, context } = state;
  const image = locationImage(location);
  const address = locationAddress(location);
  const category =
    location.primary_category ||
    location.activity_type ||
    location.location_type ||
    "Anchor location";

  return (
    <div className="mb-5 overflow-hidden rounded-[1.25rem] border border-[#e1062a]/35 bg-gradient-to-br from-[#19070b] via-[#10090b] to-black shadow-2xl shadow-black/35">
      <div className="grid gap-0 sm:grid-cols-[190px_1fr]">
        <div className="relative min-h-40 overflow-hidden bg-white/5 sm:min-h-full">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={locationName(location)} className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-40 items-center justify-center text-5xl" aria-hidden="true">📍</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>
        <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">Searching near</p>
          <h2 className="mt-2 break-words text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">{locationName(location)}</h2>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-white/35">{category}</p>
          {address ? <p className="mt-3 text-sm font-semibold leading-6 text-white/55">{address}</p> : null}
          <p className="mt-3 text-sm font-semibold leading-6 text-white/75">The recommendations below are measured from this location.</p>
          {context?.heading ? <p className="mt-4 text-sm font-black text-white">{context.heading}</p> : null}
        </div>
      </div>
    </div>
  );
}

function DemoFixtureCard({ location }: { location: DemoFixtureLocation }) {
  const image = locationImage(location);
  return (
    <div className="mb-5 overflow-hidden rounded-[1.5rem] border border-rose-400/40 bg-gradient-to-br from-[#25070f] via-[#12080b] to-black shadow-2xl shadow-black/40">
      <div className="grid gap-0 sm:grid-cols-[220px_1fr]">
        <div className="relative min-h-52 bg-white/5">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="TheOutHaven Lounge" className="absolute inset-0 h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-52 items-center justify-center text-6xl" aria-hidden="true">✨</div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
        </div>
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-rose-300/25 bg-rose-500/15 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-rose-100">Internal Demo Venue</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/55">Not public search inventory</span>
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-tight text-white">TheOutHaven Lounge</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-white/60">{locationAddress(location) || "TheOutHaven internal test venue"}</p>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-6 text-white/75">Use this controlled venue to demo the real customer journey from search to public profile, reservation, and review without exposing the fixture to normal users.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href={location.publicViewHref} className="rounded-full bg-[#e1062a] px-5 py-3 text-sm font-black text-white transition hover:bg-[#ff174f]">Public View</Link>
            <Link href={location.reservationHref} className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black">Test Reservation</Link>
            <Link href={location.reviewHref} className="rounded-full border border-white/15 bg-white/10 px-5 py-3 text-sm font-black text-white transition hover:bg-white hover:text-black">Test Review</Link>
            <Link href={location.locationDashboardHref} className="rounded-full border border-rose-300/25 bg-rose-500/10 px-5 py-3 text-sm font-black text-rose-100 transition hover:bg-rose-500/20">Location Dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AnchorAwareCreatePage() {
  const [anchor, setAnchor] = useState<AnchorState | null>(null);
  const [builder, setBuilder] = useState<BuilderState | null>(null);
  const [demoFixture, setDemoFixture] = useState<DemoFixtureLocation | null>(null);
  const [anchorTarget, setAnchorTarget] = useState<HTMLElement | null>(null);
  const [builderTarget, setBuilderTarget] = useState<HTMLElement | null>(null);
  const [demoTarget, setDemoTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    const wrappedFetch: typeof window.fetch = async (...args) => {
      const requestUrl = typeof args[0] === "string" ? args[0] : args[0] instanceof URL ? args[0].toString() : args[0]?.url || "";
      const searchedForDemoFixture = requestUrl.includes("/api/generate") && isTheOutHavenLoungeQuery(requestSearchText(args));
      const response = await originalFetch(...args);

      if (requestUrl.includes("/api/generate")) {
        if (searchedForDemoFixture) {
          void originalFetch("/api/admin/demo/theouthaven-lounge")
            .then(async (fixtureResponse) => {
              if (!fixtureResponse.ok) {
                setDemoFixture(null);
                return;
              }
              const fixturePayload = await fixtureResponse.json();
              setDemoFixture(fixturePayload?.location || null);
            })
            .catch(() => setDemoFixture(null));
        } else {
          setDemoFixture(null);
        }

        void response.clone().json().then((payload) => {
          const location = payload?.anchor_location || payload?.anchorLocation || payload?.anchor?.location || payload?.searchV2?.anchor?.location;
          const context = payload?.search_context || payload?.searchContext || payload?.anchor?.context || payload?.searchV2?.anchor?.context;
          const anchorRequested = Boolean(context?.mode === "anchored_nearby" || context?.anchorRequested || payload?.anchor?.requested || payload?.searchV2?.anchor?.requested);
          if (location && anchorRequested) setAnchor({ location, context: context ?? null });
          else setAnchor(null);

          const nextBuilder = payload?.builder || payload?.searchV2?.builder || null;
          if (nextBuilder?.enabled && Array.isArray(nextBuilder.restaurants) && Array.isArray(nextBuilder.activities)) setBuilder(nextBuilder);
          else setBuilder(null);
        }).catch(() => undefined);
      }
      return response;
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (!anchor && !builder && !demoFixture) {
      document.getElementById("anchor-search-context-slot")?.remove();
      document.getElementById("build-your-own-outing-slot")?.remove();
      document.getElementById("theouthaven-lounge-demo-slot")?.remove();
      setAnchorTarget(null);
      setBuilderTarget(null);
      setDemoTarget(null);
      return;
    }

    const mountSlots = () => {
      const section = findResultsSection();
      if (!section) return false;

      if (demoFixture) {
        let slot = document.getElementById("theouthaven-lounge-demo-slot");
        if (!slot) {
          slot = document.createElement("div");
          slot.id = "theouthaven-lounge-demo-slot";
          section.insertBefore(slot, section.firstChild);
        }
        setDemoTarget(slot);
      } else {
        document.getElementById("theouthaven-lounge-demo-slot")?.remove();
        setDemoTarget(null);
      }

      if (anchor) {
        let slot = document.getElementById("anchor-search-context-slot");
        if (!slot) {
          slot = document.createElement("div");
          slot.id = "anchor-search-context-slot";
          section.insertBefore(slot, section.firstChild);
        }
        setAnchorTarget(slot);
      } else {
        document.getElementById("anchor-search-context-slot")?.remove();
        setAnchorTarget(null);
      }

      if (builder) {
        let slot = document.getElementById("build-your-own-outing-slot");
        if (!slot) {
          slot = document.createElement("div");
          slot.id = "build-your-own-outing-slot";
          section.appendChild(slot);
        }
        setBuilderTarget(slot);
      } else {
        document.getElementById("build-your-own-outing-slot")?.remove();
        setBuilderTarget(null);
      }
      return true;
    };

    if (mountSlots()) return;
    const observer = new MutationObserver(() => {
      if (mountSlots()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [anchor, builder, demoFixture]);

  return (
    <>
      <CreatePageLegacy />
      {demoFixture && demoTarget ? createPortal(<DemoFixtureCard location={demoFixture} />, demoTarget) : null}
      {anchor && anchorTarget ? createPortal(<AnchorContextCard state={anchor} />, anchorTarget) : null}
      {builder && builderTarget ? createPortal(<BuildYourOwnOuting builder={builder} />, builderTarget) : null}
    </>
  );
}
