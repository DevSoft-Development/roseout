import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { normalizeShortCode, normalizeShortLinkDestination } from "@/lib/outings/short-links";
import { ensureShortLink } from "@/lib/short-links/service";

export const dynamic = "force-dynamic";

function shortHeader(value: string | null, max = 2048) {
  return value ? value.slice(0, max) : null;
}

async function resolveRegisteredShortLink(req: NextRequest, code: string) {
  const admin = getSupabaseAdminClient();
  const { data: link, error } = await admin
    .from("short_links")
    .select("id,code,destination_url,is_active,expires_at,max_clicks,click_count,link_type,entity_type,entity_id,campaign_id,metadata")
    .eq("code", code)
    .maybeSingle();

  if (error) {
    console.error("Unable to resolve registered short link", { code, error: error.message });
    return null;
  }
  if (!link) return null;

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
  if (!link.is_active) return NextResponse.redirect(`${siteUrl}/create?link=disabled`, 302);
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(`${siteUrl}/create?link=expired`, 302);
  }
  if (link.max_clicks && Number(link.click_count || 0) >= Number(link.max_clicks)) {
    return NextResponse.redirect(`${siteUrl}/create?link=limit-reached`, 302);
  }

  const destination = normalizeShortLinkDestination(link.destination_url);
  if (!destination) {
    console.error("Registered short link has an invalid destination", { code, linkId: link.id });
    return NextResponse.redirect(`${siteUrl}/create?link=invalid`, 302);
  }

  const query = req.nextUrl.searchParams;
  const clickedAt = new Date().toISOString();
  const { error: clickError } = await admin.from("short_link_clicks").insert({
    short_link_id: link.id,
    clicked_at: clickedAt,
    referrer: shortHeader(req.headers.get("referer")),
    user_agent: shortHeader(req.headers.get("user-agent"), 1024),
    country: shortHeader(req.headers.get("x-vercel-ip-country"), 64),
    region: shortHeader(req.headers.get("x-vercel-ip-country-region"), 128),
    city: shortHeader(req.headers.get("x-vercel-ip-city"), 128),
    utm_source: shortHeader(query.get("utm_source"), 256),
    utm_medium: shortHeader(query.get("utm_medium"), 256),
    utm_campaign: shortHeader(query.get("utm_campaign"), 256),
    utm_content: shortHeader(query.get("utm_content"), 256),
    utm_term: shortHeader(query.get("utm_term"), 256),
    metadata: {
      link_type: link.link_type,
      entity_type: link.entity_type,
      entity_id: link.entity_id,
      campaign_id: link.campaign_id,
    },
  });

  if (clickError) {
    console.error("Unable to record short link click", { code, linkId: link.id, error: clickError.message });
  }

  return NextResponse.redirect(destination, 302);
}

async function resolveClaimShortLink(req: NextRequest, code: string) {
  if (!/^TOH-[A-Z0-9]{4}-[A-Z0-9]{4}$/i.test(code)) return null;

  const admin = getSupabaseAdminClient();
  const normalized = code.toUpperCase();
  const [{ data: claimCode }, { data: location }] = await Promise.all([
    admin
      .from("location_claim_codes")
      .select("id,location_id,claim_code,status")
      .eq("claim_code", normalized)
      .maybeSingle(),
    admin
      .from("locations")
      .select("id,claim_code")
      .eq("claim_code", normalized)
      .maybeSingle(),
  ]);

  const matchedLocationId = claimCode?.location_id || location?.id || null;
  if (!claimCode && !location) return null;
  if (claimCode?.status === "claimed") {
    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
    return NextResponse.redirect(`${siteUrl}/business/claim?code=${encodeURIComponent(normalized)}`, 302);
  }

  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
  const destination = `${siteUrl}/business/claim?code=${encodeURIComponent(normalized)}`;

  try {
    await ensureShortLink(admin, {
      destinationUrl: destination,
      linkType: "claim",
      entityType: claimCode ? "location_claim_code" : "location",
      entityId: claimCode?.id || matchedLocationId || normalized,
      title: `Business claim ${normalized}`,
      preferredCode: normalized,
      metadata: {
        claim_code: normalized,
        location_id: matchedLocationId,
      },
    });
    return resolveRegisteredShortLink(req, normalized);
  } catch (error) {
    console.error("Unable to register claim short link", { code: normalized, error });
    return NextResponse.redirect(destination, 302);
  }
}

async function resolveLegacyOutingShortLink(req: NextRequest, code: string) {
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
  const admin = getSupabaseAdminClient();
  const { data: outing, error } = await admin
    .from("outings")
    .select("id,user_id,plan_access_token,plan_access_token_expires_at,link_click_count,metadata")
    .eq("metadata->>short_code", code)
    .maybeSingle();

  if (error || !outing) {
    return NextResponse.redirect(`${siteUrl}/create?link=not-found`, 302);
  }

  if (outing.plan_access_token_expires_at && new Date(outing.plan_access_token_expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(`${siteUrl}/create?link=expired`, 302);
  }

  const nextCount = Number(outing.link_click_count || 0) + 1;
  await admin
    .from("outings")
    .update({
      last_link_clicked_at: new Date().toISOString(),
      last_link_clicked_type: "short_plan",
      link_click_count: nextCount,
    })
    .eq("id", outing.id);

  await trackEvent({
    event_name: "short_link_opened",
    event_type: "share",
    outing_id: outing.id,
    page_path: req.nextUrl.pathname,
    source: "short_link",
    metadata: {
      short_code: code,
      click_count: nextCount,
      referrer: req.headers.get("referer") || null,
    },
  }).catch(() => undefined);

  const viewPicks = req.nextUrl.searchParams.get("view") === "picks";
  if (viewPicks) {
    return NextResponse.redirect(`${siteUrl}/create?guided=results&snapshot=${encodeURIComponent(code)}`, 302);
  }

  if (outing.plan_access_token) {
    return NextResponse.redirect(`${siteUrl}/outings/guest/${outing.plan_access_token}`, 302);
  }

  return NextResponse.redirect(`${siteUrl}/outings/${outing.id}`, 302);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = normalizeShortCode(rawCode);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");

  if (!code) return NextResponse.redirect(`${siteUrl}/create`, 302);

  const registered = await resolveRegisteredShortLink(req, code);
  if (registered) return registered;

  const claim = await resolveClaimShortLink(req, code);
  if (claim) return claim;

  return resolveLegacyOutingShortLink(req, code);
}
