import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { normalizeShortCode } from "@/lib/outings/short-links";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = normalizeShortCode(rawCode);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");

  if (!code) return NextResponse.redirect(`${siteUrl}/create`, 302);

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
