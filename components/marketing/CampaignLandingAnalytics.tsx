"use client";

import Link from "next/link";
import type React from "react";
import { trackLocationEvent, type LocationAnalyticsMetadata } from "@/lib/location-analytics";
import { useTrackLocationView } from "@/hooks/useTrackLocationView";

type LocationMetadataProps = {
  locationId?: string | null;
  campaignId?: string | null;
  sourceSection?: string;
};

function metadata({ campaignId, sourceSection = "campaign_outing" }: LocationMetadataProps): LocationAnalyticsMetadata {
  return {
    source_page: "/go",
    source_section: sourceSection,
    campaign_id: campaignId || undefined,
  };
}

function track(
  locationId: string | null | undefined,
  eventType: "click" | "save" | "booking",
  props: LocationMetadataProps,
) {
  trackLocationEvent(locationId, eventType, metadata(props));
}

export function CampaignLocationViewBoundary({
  locationId,
  campaignId,
  sourceSection = "campaign_outing",
  className,
  children,
}: LocationMetadataProps & {
  className: string;
  children: React.ReactNode;
}) {
  const ref = useTrackLocationView<HTMLDivElement>(locationId, metadata({ campaignId, sourceSection }));

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

export function CampaignLandingActionLinks({
  locationId,
  campaignId,
  planHref,
  publicLocationUrl,
  reserveHref,
  similarHref,
}: LocationMetadataProps & {
  planHref: string;
  publicLocationUrl: string;
  reserveHref: string;
  similarHref: string;
}) {
  const props = { locationId, campaignId, sourceSection: "campaign_outing" };

  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      <Link href={planHref} onClick={() => { track(locationId, "click", props); track(locationId, "save", props); }} className="rounded-full bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 px-5 py-4 text-center text-sm font-black text-white shadow-lg shadow-rose-950/20">Plan this outing</Link>
      {publicLocationUrl ? <Link href={publicLocationUrl} onClick={() => track(locationId, "click", props)} className="rounded-full bg-[#1b1210] px-5 py-4 text-center text-sm font-black text-white">View location</Link> : <Link href="/create" onClick={() => track(locationId, "click", props)} className="rounded-full bg-[#1b1210] px-5 py-4 text-center text-sm font-black text-white">View location</Link>}
      <Link href={reserveHref} onClick={() => { track(locationId, "click", props); track(locationId, "booking", props); }} className="rounded-full border border-[#1b1210] bg-white px-5 py-4 text-center text-sm font-black text-[#1b1210] sm:border-black/10">Reserve if available</Link>
      <Link href={similarHref} onClick={() => { track(locationId, "click", props); track(locationId, "save", props); }} className="rounded-full border border-[#1b1210] bg-white px-5 py-4 text-center text-sm font-black text-[#1b1210] sm:border-black/10">Plan Similar Outing</Link>
    </div>
  );
}

export function NearbyLocationLink({
  locationId,
  href,
  children,
}: {
  locationId?: string | null;
  href: string;
  children: React.ReactNode;
}) {
  const viewRef = useTrackLocationView<HTMLAnchorElement>(locationId, {
    source_page: "/go",
    source_section: "outing_card",
  });

  return (
    <Link ref={viewRef} href={href} onClick={() => trackLocationEvent(locationId, "click", { source_page: "/go", source_section: "outing_card" })} className="grid grid-cols-[96px_1fr] gap-3 rounded-[1.5rem] border border-black/10 bg-white p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      {children}
    </Link>
  );
}
