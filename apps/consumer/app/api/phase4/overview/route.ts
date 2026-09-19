import { NextResponse } from "next/server";

import {
  cvr,
  ctr,
  formatDollars,
  phase4Automations,
  phase4Campaigns,
  phase4MarketplaceOffers,
  phase4RevenueSnapshot,
} from "@/lib/phase4-platform";

export async function GET() {
  const campaigns = phase4Campaigns.map((campaign) => ({
    ...campaign,
    ctr: ctr(campaign),
    cvr: cvr(campaign),
    spend: formatDollars(campaign.spendCents),
  }));

  const marketplace = phase4MarketplaceOffers.map((offer) => ({
    ...offer,
    price: formatDollars(offer.priceCents),
    serviceFee: formatDollars(offer.serviceFeeCents),
    bookingFee: formatDollars(offer.bookingFeeCents),
  }));

  const metrics = {
    ...phase4RevenueSnapshot,
    mrr: formatDollars(phase4RevenueSnapshot.mrrCents),
    adRevenue: formatDollars(phase4RevenueSnapshot.adRevenueCents),
    bookingRevenue: formatDollars(phase4RevenueSnapshot.bookingRevenueCents),
    payout: formatDollars(phase4RevenueSnapshot.payoutCents),
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    campaigns,
    marketplace,
    automations: phase4Automations,
    metrics,
    capabilities: {
      monetization: [
        "promoted listings",
        "featured on homepage/search/trending",
        "nightlife campaigns",
        "creator partnerships",
      ],
      aiCopilot: [
        "promotion generator",
        "review response generator",
        "event idea generator",
        "reservation recovery automation",
      ],
      trustSafety: [
        "moderation queue",
        "spam controls",
        "risk scoring hooks",
      ],
      mobileReadiness: ["shared API layer", "deep linking", "PWA installability"],
      scalability: ["Redis cache plan", "queue workers", "rate limiting", "API monitoring"],
    },
  });
}
