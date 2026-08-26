import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRenderedEmail } from "@/lib/email/sender";
import { renderOutingPlanEmail } from "@/lib/email/templates/outingPlanEmail";
import { buildShortLinkUrl } from "@/lib/outings/short-links";

function clean(value: unknown, max = 500) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function validEmail(value: unknown) {
  const email = clean(value, 320)?.toLowerCase() || null;
  return email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

function isUuid(value: string | null): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(value));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const outingId = clean(body?.outingId, 80);
    const to = validEmail(body?.to);
    if (!isUuid(outingId) || !to) {
      return NextResponse.json({ ok: false, error: "invalid_request", message: "Add a valid email address." }, { status: 400 });
    }

    const sessionSupabase = await createClient();
    const { data: authData } = await sessionSupabase.auth.getUser();
    const userId = authData?.user?.id || null;
    const guestSessionId = req.cookies.get("theouthaven_guest_session")?.value || null;

    const { data: outing, error } = await supabaseAdmin
      .from("outings")
      .select("id,user_id,guest_session_id,plan_title,planned_for,timezone,outing_date_context,metadata")
      .eq("id", outingId)
      .maybeSingle();
    if (error || !outing) return NextResponse.json({ ok: false, error: "outing_not_found" }, { status: 404 });

    const authorized = userId
      ? outing.user_id === userId
      : Boolean(guestSessionId && outing.guest_session_id === guestSessionId);
    if (!authorized) return NextResponse.json({ ok: false, error: "outing_not_found" }, { status: 404 });

    const metadata = outing.metadata && typeof outing.metadata === "object" && !Array.isArray(outing.metadata)
      ? outing.metadata as Record<string, unknown>
      : {};
    const selected = metadata.selected_locations && typeof metadata.selected_locations === "object" && !Array.isArray(metadata.selected_locations)
      ? metadata.selected_locations as Record<string, unknown>
      : {};
    const shortCode = clean(metadata.short_code, 40);
    if (!shortCode) return NextResponse.json({ ok: false, error: "plan_link_missing" }, { status: 409 });

    const rendered = renderOutingPlanEmail({
      planTitle: clean(outing.plan_title, 300),
      planUrl: buildShortLinkUrl(shortCode),
      restaurant: selected.restaurant || null,
      activity: selected.activity || null,
      plannedFor: clean(outing.planned_for, 80),
      timezone: clean(outing.timezone, 80) || "America/New_York",
      outingDateContext: clean(outing.outing_date_context, 160),
      outingDateTimeText: null,
    });
    const result = await sendRenderedEmail({ to, rendered, department: "plans", templateKey: "outing_plan" });
    if (result.status === "error") {
      console.error("OUTING_PLAN_EMAIL_FAILED", result.error);
      return NextResponse.json({ ok: false, error: "email_failed", message: "We could not email your plan yet." }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("OUTING_PLAN_EMAIL_INVALID_REQUEST", error);
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }
}
