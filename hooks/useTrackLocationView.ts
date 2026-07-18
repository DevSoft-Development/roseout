"use client";

import { useEffect, useRef } from "react";
import {
  trackLocationEvent,
  type LocationAnalyticsMetadata,
} from "@/lib/location-analytics";

const observedViewKeys = new Set<string>();

function metadataKey(metadata?: LocationAnalyticsMetadata) {
  if (!metadata) return "";
  return [
    metadata.source_page || "",
    metadata.source_section || "",
    metadata.campaign_id || "",
  ].join(":");
}

function exposeCreateResultIdentity(
  element: Element,
  locationId: string,
  metadata?: LocationAnalyticsMetadata,
) {
  if (
    metadata?.source_page !== "/create" ||
    metadata?.source_section !== "search_results" ||
    !(element instanceof HTMLElement)
  ) {
    return;
  }

  element.dataset.searchResultIdentity = locationId;

  if (locationId.startsWith("combo:")) {
    const [, restaurantLocationId = "", activityLocationId = ""] =
      locationId.split(":");
    element.dataset.searchResultType = "pair";
    element.dataset.restaurantLocationId = restaurantLocationId;
    element.dataset.activityLocationId = activityLocationId;
    delete element.dataset.locationId;
    return;
  }

  element.dataset.locationId = locationId;
  delete element.dataset.restaurantLocationId;
  delete element.dataset.activityLocationId;
}

export function useTrackLocationView<TElement extends Element = HTMLElement>(
  locationId: string | null | undefined,
  metadata?: LocationAnalyticsMetadata,
) {
  const ref = useRef<TElement | null>(null);
  const firedRef = useRef(false);
  const sourcePage = metadata?.source_page;
  const sourceSection = metadata?.source_section;
  const campaignId = metadata?.campaign_id;

  useEffect(() => {
    const currentMetadata: LocationAnalyticsMetadata | undefined =
      sourcePage || sourceSection || campaignId
        ? {
            source_page: sourcePage,
            source_section: sourceSection,
            campaign_id: campaignId,
          }
        : undefined;
    if (!locationId || typeof window === "undefined") return;

    const element = ref.current;
    if (!element) return;

    exposeCreateResultIdentity(element, locationId, currentMetadata);

    if (firedRef.current || !("IntersectionObserver" in window)) return;

    const viewKey = `${locationId}:${metadataKey(currentMetadata)}`;
    if (observedViewKeys.has(viewKey)) {
      firedRef.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (!isVisible || firedRef.current || observedViewKeys.has(viewKey)) return;

        firedRef.current = true;
        observedViewKeys.add(viewKey);
        trackLocationEvent(locationId, "view", currentMetadata);
        observer.disconnect();
      },
      { threshold: 0.35 },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [campaignId, locationId, sourcePage, sourceSection]);

  return ref;
}
