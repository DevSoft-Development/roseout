export type MonetizationChannel =
  | "promoted_listing"
  | "sponsored_placement"
  | "featured_outing"
  | "featured_business_boost"
  | "event_promo_package"
  | "nightlife_campaign"
  | "creator_partnership";

export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export interface AdCampaign {
  id: string;
  name: string;
  channel: MonetizationChannel;
  businessName: string;
  status: CampaignStatus;
  spendCents: number;
  impressions: number;
  clicks: number;
  conversions: number;
  startsAt: string;
  endsAt: string;
}

export interface MarketplaceOffer {
  id: string;
  title: string;
  hostType: "business" | "creator";
  category: "ticket" | "private_experience" | "curated_outing" | "nightlife_package";
  priceCents: number;
  serviceFeeCents: number;
  bookingFeeCents: number;
  commissionRate: number;
}

export interface AutomationScenario {
  id: string;
  name: string;
  audience: "consumer" | "business";
  trigger: string;
  channel: "email" | "sms" | "push";
  enabled: boolean;
}

export interface RevenueSnapshot {
  mrrCents: number;
  adRevenueCents: number;
  bookingRevenueCents: number;
  payoutCents: number;
  activeBusinesses: number;
  conversionRate: number;
  monthlyChurnRate: number;
}

export function ctr(campaign: Pick<AdCampaign, "impressions" | "clicks">): number {
  if (!campaign.impressions) return 0;
  return campaign.clicks / campaign.impressions;
}

export function cvr(campaign: Pick<AdCampaign, "clicks" | "conversions">): number {
  if (!campaign.clicks) return 0;
  return campaign.conversions / campaign.clicks;
}

export function formatDollars(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export const phase4Campaigns: AdCampaign[] = [
  {
    id: "camp_001",
    name: "Friday Rooftop Boost",
    channel: "nightlife_campaign",
    businessName: "Skyline Ember",
    status: "active",
    spendCents: 128000,
    impressions: 104223,
    clicks: 6212,
    conversions: 508,
    startsAt: "2026-05-01",
    endsAt: "2026-05-31",
  },
  {
    id: "camp_002",
    name: "Date Night Hero Placement",
    channel: "featured_business_boost",
    businessName: "Maison Fleur",
    status: "active",
    spendCents: 92000,
    impressions: 58321,
    clicks: 3122,
    conversions: 260,
    startsAt: "2026-05-05",
    endsAt: "2026-06-05",
  },
];

export const phase4MarketplaceOffers: MarketplaceOffer[] = [
  {
    id: "off_001",
    title: "Private Chef + Jazz Tasting",
    hostType: "creator",
    category: "private_experience",
    priceCents: 18500,
    serviceFeeCents: 1200,
    bookingFeeCents: 450,
    commissionRate: 0.18,
  },
  {
    id: "off_002",
    title: "Rooftop Birthday Package",
    hostType: "business",
    category: "nightlife_package",
    priceCents: 22000,
    serviceFeeCents: 1600,
    bookingFeeCents: 550,
    commissionRate: 0.12,
  },
];

export const phase4Automations: AutomationScenario[] = [
  {
    id: "auto_001",
    name: "Birthday Recommendations",
    audience: "consumer",
    trigger: "14 days before birthday",
    channel: "push",
    enabled: true,
  },
  {
    id: "auto_002",
    name: "Slow-Day Promotion",
    audience: "business",
    trigger: "forecast occupancy below 45%",
    channel: "sms",
    enabled: true,
  },
  {
    id: "auto_003",
    name: "Reservation Recovery",
    audience: "consumer",
    trigger: "abandoned booking after 60 minutes",
    channel: "email",
    enabled: true,
  },
];

export const phase4RevenueSnapshot: RevenueSnapshot = {
  mrrCents: 814500,
  adRevenueCents: 253400,
  bookingRevenueCents: 476900,
  payoutCents: 311200,
  activeBusinesses: 148,
  conversionRate: 0.094,
  monthlyChurnRate: 0.021,
};
