import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { requireCronRequest } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function safeCount(table: string, apply: (query: any) => any = (query) => query) {
  const query = apply(supabaseAdmin.from(table).select("id", { count: "exact", head: true }));
  const { count, error } = await query;
  if (error) return null;
  return count || 0;
}

async function safeRows(table: string, select: string, apply: (query: any) => any = (query) => query) {
  const query = apply(supabaseAdmin.from(table).select(select));
  const { data, error } = await query;
  if (error) return [];
  return data || [];
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const to = process.env.ADMIN_DIGEST_EMAIL || process.env.THEOUTHAVEN_ADMIN_EMAIL || process.env.SUPERADMIN_EMAIL;
  if (!to || !process.env.RESEND_API_KEY) {
    return NextResponse.json({
      success: false,
      skipped: true,
      error: "ADMIN_DIGEST_EMAIL and RESEND_API_KEY are required to send the daily digest.",
    }, { status: 200 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [
    zeroResults,
    missingPhotos,
    notSearchable,
    newLocations,
    publishReady,
    topSearches,
    topClicks,
  ] = await Promise.all([
    safeCount("analytics_events", (q) => q.eq("event_name", "search_zero_results").gte("created_at", since)),
    safeCount("locations", (q) => q.or("main_image.is.null,image_url.is.null")),
    safeCount("locations", (q) => q.or("is_searchable.is.false,publish_ready.is.false")),
    safeCount("locations", (q) => q.gte("created_at", since)),
    safeCount("locations", (q) => q.eq("publish_ready", true)),
    safeRows("analytics_events", "event_name,metadata,created_at", (q) => q.eq("event_name", "search_submitted").gte("created_at", since).order("created_at", { ascending: false }).limit(10)),
    safeRows("analytics_events", "event_name,location_id,metadata,created_at", (q) => q.eq("event_name", "result_clicked").gte("created_at", since).order("created_at", { ascending: false }).limit(10)),
  ]);

  const body = [
    `Daily production health digest for ${new Date().toLocaleDateString("en-US")}.`,
    "",
    `Zero-result searches: ${zeroResults ?? "not tracked"}`,
    `Locations missing photos: ${missingPhotos ?? "unknown"}`,
    `Locations not searchable/publish-ready: ${notSearchable ?? "unknown"}`,
    `New locations added: ${newLocations ?? "unknown"}`,
    `Publish-ready locations: ${publishReady ?? "unknown"}`,
    "",
    "Top/recent searches:",
    ...topSearches.map((row: any) => `- ${row.metadata?.query || row.metadata?.search || "search_submitted"}`),
    "",
    "Recent clicked locations:",
    ...topClicks.map((row: any) => `- ${row.location_id || row.metadata?.location_id || "unknown location"}`),
  ].join("\n");

  const result = await sendRawBrandedEmail({
    to,
    department: "system",
    subject: "TheOutHaven daily production health digest",
    heading: "Daily production health digest",
    body,
  });

  return NextResponse.json({ success: result.status !== "error", action: "daily_admin_digest", counts: { zeroResults, missingPhotos, notSearchable, newLocations, publishReady }, emailSent: result.status !== "error" });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
