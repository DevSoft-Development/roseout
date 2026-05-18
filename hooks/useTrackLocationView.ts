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
    if (!locationId || firedRef.current || typeof window === "undefined") return;

    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) return;

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
