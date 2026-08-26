import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { sendConciergeSms } from "@/lib/sms/telnyx";
import { trackEvent } from "@/lib/analytics/trackEvent";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";
import { ensureShortLink } from "@/lib/short-links/service";

function normalizePhone(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/[^+\d]/g, "");
  if (!cleaned) return null;
  if (cleaned.startsWith("+")) return cleaned.length >= 8 ? cleaned : null;
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith("1")) return `+${cleaned}`;
  return cleaned.length >= 8 ? `+${cleaned}` : null;
}

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const to = normalizePhone(payload?.to);
    const relativePlanUrl = clean(payload?.planUrl);
    const planTitle = clean(payload?.planTitle) || "Your TheOutHaven plan";
    const restaurantName = clean(payload?.restaurantName);
    const activityName = clean(payload?.activityName);

    if (!to) {
      return NextResponse.json({ ok: false, message: "Enter a valid mobile number." }, { status: 400 });
    }
    if (!relativePlanUrl) {
      return NextResponse.json({ ok: false, message: "A saved plan link is required." }, { status: 400 });
    }

    const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com").replace(/\/$/, "");
    const absolutePlanUrl = relativePlanUrl.startsWith("http")
      ? relativePlanUrl
      : `${siteUrl}${relativePlanUrl.startsWith("/") ? relativePlanUrl : `/${relativePlanUrl}`}`;

    let parsedPlanUrl: URL;
    try {
      parsedPlanUrl = new URL(absolutePlanUrl);
    } catch {
      return NextResponse.json({ ok: false, message: "The saved plan link is invalid." }, { status: 400 });
    }

    const siteHost = new URL(siteUrl).hostname.toLowerCase();
    const planHost = parsedPlanUrl.hostname.toLowerCase();
    const shortHost = "outhvn.com";
    if (planHost !== siteHost && planHost !== `www.${siteHost}` && planHost !== shortHost && planHost !== `www.${shortHost}`) {
      return NextResponse.json({ ok: false, message: "The saved plan link is not a TheOutHaven link." }, { status: 400 });
    }

    let planUrl = parsedPlanUrl.toString();
    if (planHost !== shortHost && planHost !== `www.${shortHost}`) {
      const destinationKey = createHash("sha256").update(planUrl).digest("hex").slice(0, 32);
      const shortLink = await ensureShortLink(getSupabaseAdminClient(), {
        destinationUrl: planUrl,
        linkType: "plan_text",
        entityType: "plan_text_destination",
        entityId: destinationKey,
        title: planTitle,
        metadata: {
          source: "plan_text",
          has_restaurant: Boolean(restaurantName),
          has_activity: Boolean(activityName),
        },
      });
      planUrl = shortLink.shortUrl;
    }

    const stops = [restaurantName, activityName].filter(Boolean).join(" + ");
    const body = [
      "TheOutHaven Concierge",
      planTitle,
      stops || null,
      `View your full plan: ${planUrl}`,
      "If you need directions or any information about your outing, just ask me here.",
      "Reply STOP to opt out.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await sendConciergeSms({ to, body });

    await trackEvent({
      event_name: "plan_text_sent",
      event_type: "share",
      page_path: "/plan",
      source: "plan_share",
      metadata: {
        plan_title: planTitle,
        has_restaurant: Boolean(restaurantName),
        has_activity: Boolean(activityName),
        short_link_used: planUrl.includes("outhvn.com/"),
        sms_status: result?.status || null,
        sms_channel: "concierge",
        sms_sender: "+15162000411",
        concierge_help_prompt: true,
      },
    });

    if (result?.status === "error") {
      return NextResponse.json({ ok: false, message: "Your plan was saved, but the text could not be sent." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, status: result?.status || "sent", shortUrl: planUrl });
  } catch (error) {
    console.error("OUTING_PLAN_TEXT_FAILED", error);
    return NextResponse.json({ ok: false, message: "We could not text your plan yet." }, { status: 500 });
  }
}
