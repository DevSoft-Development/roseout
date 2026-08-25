import { NextRequest, NextResponse } from "next/server";
import { sendSms } from "@/lib/sms/sendSms";
import { trackEvent } from "@/lib/analytics/trackEvent";

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
    const planUrl = relativePlanUrl.startsWith("http")
      ? relativePlanUrl
      : `${siteUrl}${relativePlanUrl.startsWith("/") ? relativePlanUrl : `/${relativePlanUrl}`}`;

    const stops = [restaurantName, activityName].filter(Boolean).join(" + ");
    const body = [
      "TheOutHaven",
      planTitle,
      stops || null,
      `View your full plan: ${planUrl}`,
      "Reply STOP to opt out.",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await sendSms({ to, body });

    await trackEvent({
      event_name: "plan_text_sent",
      event_type: "share",
      page_path: "/plan",
      source: "plan_share",
      metadata: {
        plan_title: planTitle,
        has_restaurant: Boolean(restaurantName),
        has_activity: Boolean(activityName),
        sms_status: result?.status || null,
      },
    });

    if (result?.status === "error") {
      return NextResponse.json({ ok: false, message: "Your plan was saved, but the text could not be sent." }, { status: 502 });
    }

    return NextResponse.json({ ok: true, status: result?.status || "sent" });
  } catch (error) {
    console.error("OUTING_PLAN_TEXT_FAILED", error);
    return NextResponse.json({ ok: false, message: "We could not text your plan yet." }, { status: 500 });
  }
}
