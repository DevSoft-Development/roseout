"use client";

import Image from "next/image";
import Link from "next/link";
import { trackLocationEvent, type LocationAnalyticsMetadata } from "@/lib/location-analytics";
import { useTrackLocationView } from "@/hooks/useTrackLocationView";

type TrackableCampaign = {
  id: string;
  name: string | null;
  location_source_id?: string | null;
  location_source_type?: string | null;
  location_name?: string | null;
  location_image_url?: string | null;
  location_category?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  location_description?: string | null;
  public_slug?: string | null;
  source_platform?: string | null;
  caption_category?: string | null;
  social_captions?: Record<string, string> | null;
  generated_payload?: Record<string, unknown> | null;
};

function campaignTitle(campaign: TrackableCampaign) {
  return campaign.name || campaign.location_name || "TheOutHaven featured plan";
}

function campaignImage(campaign: TrackableCampaign) {
  return campaign.location_image_url || "/placeholder.jpg";
}

function campaignPlace(campaign: TrackableCampaign) {
  return [campaign.location_city, campaign.location_state].filter(Boolean).join(", ");
}

function campaignCaption(campaign: TrackableCampaign) {
  const captions = campaign.social_captions || {};
  const generated = campaign.generated_payload || {};
  return captions.instagram || captions.tiktok || (typeof generated.instagram_caption === "string" ? generated.instagram_caption : "") || campaign.location_category || "Social pick";
}

function buildCampaignPlanHref(campaign: TrackableCampaign) {
  const params = new URLSearchParams({
    campaignSlug: campaign.public_slug || "",
    planExact: "true",
  });

  if (campaign.location_source_id) params.set("locationId", campaign.location_source_id);
  if (campaign.location_source_type) params.set("sourceTable", campaign.location_source_type);

  return `/create?${params.toString()}`;
}

function campaignMetadata(campaign: TrackableCampaign, sourceSection: string): LocationAnalyticsMetadata {
  return {
    source_page: "/go",
    source_section: sourceSection,
    campaign_id: campaign.id,
  };
}

function trackCampaignEvent(campaign: TrackableCampaign, eventType: "click" | "save" | "booking", sourceSection: string) {
  trackLocationEvent(campaign.location_source_id, eventType, campaignMetadata(campaign, sourceSection));
}

function Pill({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${dark ? "bg-[#1b1210] text-white" : "bg-white/90 text-[#1b1210]"}`}>
      {children}
    </span>
  );
}

export function CampaignCard({ campaign }: { campaign: TrackableCampaign }) {
  const slug = campaign.public_slug || "";
  const place = campaignPlace(campaign);
  const imageUrl = campaign.location_image_url?.trim();
  const title = campaignTitle(campaign);
  const metadata = campaignMetadata(campaign, "campaign_outing");
  const viewRef = useTrackLocationView<HTMLElement>(campaign.location_source_id, metadata);

  return (
    <article ref={viewRef} className="group flex h-full flex-col overflow-hidden rounded-[1.75rem] border border-black/10 bg-white shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-2xl">
      <Link href={slug ? `/go/${slug}` : "/go"} onClick={() => trackCampaignEvent(campaign, "click", "campaign_outing")} className="relative block overflow-hidden bg-[radial-gradient(circle_at_top_right,rgba(244,63,94,0.26),transparent_34%),linear-gradient(135deg,#1b1210,#050505_70%,#3a1715)]">
        <div className="relative aspect-[4/3] w-full">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={campaign.location_name || title}
              fill
              sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
              className="object-cover transition duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-white">
              <p className="text-2xl font-black tracking-[-0.04em]">{title}</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
          <div className="absolute left-4 right-4 top-4 flex flex-wrap gap-2">
            <Pill>{campaign.caption_category || campaign.location_category || "Featured"}</Pill>
            {campaign.source_platform ? <Pill dark>{campaign.source_platform}</Pill> : null}
          </div>
        </div>
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-xl font-black leading-tight tracking-[-0.03em] text-[#1b1210]">{title}</h3>
        <p className="mt-2 text-sm font-black uppercase tracking-[0.14em] text-rose-700">{[campaign.location_city, campaign.location_state].filter(Boolean).join(", ") || place || "TheOutHaven pick"}</p>
        <p className="mt-3 line-clamp-3 text-sm font-semibold leading-6 text-black/55">{campaign.location_description || campaignCaption(campaign)}</p>
        <div className="mt-5 grid gap-2 sm:grid-cols-2">
          <Link href={buildCampaignPlanHref(campaign)} onClick={() => { trackCampaignEvent(campaign, "click", "campaign_outing"); trackCampaignEvent(campaign, "save", "campaign_outing"); }} className="rounded-full bg-gradient-to-r from-rose-500 via-red-600 to-rose-700 px-4 py-3 text-center text-xs font-black text-white shadow-lg shadow-rose-950/15">Plan this outing</Link>
          <Link href={slug ? `/go/${slug}` : "/go"} onClick={() => trackCampaignEvent(campaign, "click", "campaign_outing")} className="rounded-full bg-[#1b1210] px-4 py-3 text-center text-xs font-black text-white">View campaign</Link>
        </div>
      </div>
    </article>
  );
}

export function CampaignTeaserLink({ campaign }: { campaign: TrackableCampaign }) {
  const metadata = campaignMetadata(campaign, "campaign_outing");
  const viewRef = useTrackLocationView<HTMLAnchorElement>(campaign.location_source_id, metadata);

  return (
    <Link ref={viewRef} key={campaign.id} href={campaign.public_slug ? `/go/${campaign.public_slug}` : "/go"} onClick={() => trackCampaignEvent(campaign, "click", "campaign_outing")} className="grid grid-cols-[88px_1fr] gap-3 rounded-[1.25rem] bg-white p-3 shadow-sm">
      <div className="relative h-24 w-[88px] overflow-hidden rounded-[1rem] bg-[#eadfd8]">
        <Image src={campaignImage(campaign)} alt={campaignTitle(campaign)} fill sizes="88px" className="object-cover" />
      </div>
      <div className="min-w-0 py-1">
        <p className="truncate text-base font-black">{campaignTitle(campaign)}</p>
        <p className="mt-1 truncate text-xs font-bold text-black/45">{[campaign.location_name, campaignPlace(campaign)].filter(Boolean).join(" • ")}</p>
        <span className="mt-3 inline-flex rounded-full bg-[#1b1210] px-3 py-1.5 text-[10px] font-black text-white">View campaign</span>
      </div>
    </Link>
  );
}
