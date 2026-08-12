import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireTurnstile } from "@/lib/security/turnstile";
import { trackGrowthProEvent } from "@/lib/growth-pro/analytics";
import { createLocationNotificationEvent } from "@/lib/growth-pro/notifications";
import {
  DEMO_CUSTOMER_EMAIL,
  requireSafeDemoPublicWrite,
} from "@/lib/demo/demo-public-write";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const action = String(body.action || "private_feedback");
  const check = await requireTurnstile({
    request,
    token: body.turnstileToken,
    action,
  });
  if (!check.success) {
    return NextResponse.json({ error: check.error }, { status: check.status });
  }

  const locationId = String(body.locationId || "");
  if (!locationId) {
    return NextResponse.json(
      { error: "Please choose a location before submitting." },
      { status: 400 },
    );
  }

  let demoContext;
  try {
    demoContext = await requireSafeDemoPublicWrite(locationId);
  } catch {
    return NextResponse.json(
      { error: "This demo action is available only to approved staff." },
      { status: 403 },
    );
  }

  if (action === "guest_check_in") {
    const { data: verification, error } = await supabaseAdmin
      .from("outing_visit_verifications")
      .insert({
        location_id: locationId,
        verification_type: "guest_check_in",
        verification_status: "verified",
        verification_source: demoContext.isDemo
          ? "demo_center"
          : "public_growth_pro",
        guest_session_id: body.guestSessionId || null,
        reservation_id: body.reservationId || null,
        metadata: {
          customer_name: demoContext.isDemo ? "Demo Check-in Guest" : body.name,
          customer_email: demoContext.isDemo
            ? DEMO_CUSTOMER_EMAIL
            : body.email,
          notes: body.notes || null,
          demo: demoContext.isDemo,
          demo_key: demoContext.isDemo
            ? "real_location_mirror_demo"
            : undefined,
        },
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json(
        { error: "We could not save this check-in." },
        { status: 500 },
      );
    }

    await trackGrowthProEvent(locationId, "guest_check_in", {
      verificationId: verification?.id,
      demo: demoContext.isDemo,
    });
    await createLocationNotificationEvent({
      locationId,
      eventType: "guest_check_in",
      title: demoContext.isDemo ? "Demo guest checked in" : "Guest checked in",
      message: demoContext.isDemo
        ? "A demo guest completed the real check-in flow for TheOutHaven Lounge."
        : "A guest checked in at this location.",
      priority: "normal",
      metadata: {
        verificationId: verification?.id,
        demo: demoContext.isDemo,
      },
    });

    return NextResponse.json({
      message: demoContext.isDemo
        ? "Demo guest checked in through the production verification flow."
        : "You're checked in. Enjoy your visit.",
    });
  }

  const customerEmail = demoContext.isDemo
    ? DEMO_CUSTOMER_EMAIL
    : body.email;
  const customerName = demoContext.isDemo
    ? "Demo Feedback Guest"
    : body.name;

  const { data: feedback, error } = await supabaseAdmin
    .from("location_private_feedback")
    .insert({
      location_id: locationId,
      customer_name: customerName,
      customer_email: customerEmail,
      rating: body.rating,
      feedback_text: body.notes,
      feedback_type: body.feedbackType || "private",
      source: demoContext.isDemo ? "demo_center" : "public_growth_pro",
      metadata: demoContext.isDemo
        ? {
            demo: true,
            demo_key: "real_location_mirror_demo",
            never_contact: true,
          }
        : {},
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: "We could not save this feedback." },
      { status: 500 },
    );
  }

  await trackGrowthProEvent(locationId, "private_feedback_submitted", {
    feedbackId: feedback?.id,
    demo: demoContext.isDemo,
  });
  await createLocationNotificationEvent({
    locationId,
    eventType: "private_feedback_submitted",
    title: demoContext.isDemo ? "Demo private feedback" : "New private feedback",
    message: demoContext.isDemo
      ? "Demo feedback was submitted through the real feedback flow."
      : "A guest submitted private feedback for this location.",
    priority: "normal",
    metadata: {
      feedbackId: feedback?.id,
      rating: body.rating,
      demo: demoContext.isDemo,
    },
  });

  return NextResponse.json({
    message: demoContext.isDemo
      ? "Demo feedback saved through the production feedback flow."
      : "Thanks — your feedback was sent privately to the business.",
  });
}
