import { NextRequest, NextResponse } from "next/server";
import { loadCampaignBySlug } from "@/lib/marketing-public";
import { resolveCampaignLocation } from "@/lib/locations/resolve-location";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const campaignSlug = searchParams.get("campaignSlug") || searchParams.get("campaign") || "";

  if (!campaignSlug) {
    return NextResponse.json({ error: "campaignSlug is required." }, { status: 400 });
  }

  const campaign = await loadCampaignBySlug(campaignSlug);
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  }

  const location = await resolveCampaignLocation(campaign);
  if (!location) {
    return NextResponse.json({ error: "Campaign location not found." }, { status: 404 });
  }

  return NextResponse.json({ campaign, location });
}
