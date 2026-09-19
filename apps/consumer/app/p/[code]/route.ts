import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { normalizeShortCode, normalizeShortLinkDestination } from "@/lib/outings/short-links";

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

function resolveClaimShortLink(code: string) {
  // Claim codes have existed in more than one historical shape. Keep the
  // existing TheOutHaven claim page as the source of truth and only use this
  // domain as an additive front door. Previously issued long claim URLs remain valid.
  if (!/^TOH-[A-Z0-9]{4}(?:-[A-Z0-9]{3,4}){1,2}$/i.test(code)) return null;
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
  return NextResponse.redirect(
    `${siteUrl}/business/claim?code=${encodeURIComponent(code.toUpperCase())}`,
    302,
  );
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

  const claim = resolveClaimShortLink(code);
  if (claim) return claim;

  return resolveLegacyOutingShortLink(req, code);
}
