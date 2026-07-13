"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
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

type AnchorSearchContext = {
  mode?: string | null;
  heading?: string | null;
  anchor_position?: string | null;
};

type AnchorState = {
  location: AnchorLocation;
  context: AnchorSearchContext | null;
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
            <img
              src={image}
              alt={locationName(location)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div
              className="flex h-full min-h-40 items-center justify-center text-5xl"
              aria-hidden="true"
            >
              📍
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        </div>

        <div className="flex min-w-0 flex-col justify-center p-5 sm:p-6">
          <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#e1062a]">
            Searching near
          </p>
          <h2 className="mt-2 break-words text-2xl font-black tracking-[-0.04em] text-white sm:text-3xl">
            {locationName(location)}
          </h2>
          <p className="mt-1 text-xs font-black uppercase tracking-[0.16em] text-white/35">
            {category}
          </p>
          {address ? (
            <p className="mt-3 text-sm font-semibold leading-6 text-white/55">
              {address}
            </p>
          ) : null}
          <p className="mt-3 text-sm font-semibold leading-6 text-white/75">
            The recommendations below are measured from this location.
          </p>
          {context?.heading ? (
            <p className="mt-4 text-sm font-black text-white">
              {context.heading}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function AnchorAwareCreatePage() {
  const [anchor, setAnchor] = useState<AnchorState | null>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    const wrappedFetch: typeof window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const requestUrl =
        typeof args[0] === "string"
          ? args[0]
          : args[0] instanceof URL
            ? args[0].toString()
            : args[0]?.url || "";

      if (requestUrl.includes("/api/generate")) {
        void response
          .clone()
          .json()
          .then((payload) => {
            const location = payload?.anchor_location;
            const context = payload?.search_context;
            if (location && context?.mode === "anchored_nearby") {
              setAnchor({ location, context });
            } else {
              setAnchor(null);
            }
          })
          .catch(() => undefined);
      }

      return response;
    };

    window.fetch = wrappedFetch;
    return () => {
      if (window.fetch === wrappedFetch) window.fetch = originalFetch;
    };
  }, []);

  useEffect(() => {
    if (!anchor) {
      document.getElementById("anchor-search-context-slot")?.remove();
      setPortalTarget(null);
      return;
    }

    const mountSlot = () => {
      const section = findResultsSection();
      if (!section) return false;

      let slot = document.getElementById("anchor-search-context-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.id = "anchor-search-context-slot";
        section.insertBefore(slot, section.firstChild);
      }
      setPortalTarget(slot);
      return true;
    };

    if (mountSlot()) return;

    const observer = new MutationObserver(() => {
      if (mountSlot()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [anchor]);

  return (
    <>
      <CreatePageLegacy />
      {anchor && portalTarget
        ? createPortal(<AnchorContextCard state={anchor} />, portalTarget)
        : null}
    </>
  );
}
