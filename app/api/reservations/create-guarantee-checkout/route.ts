import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

function integrationIdentifier() {
  const suffix = randomBytes(8).toString("hex").slice(0, 8);
  return `tohguar-${suffix}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const body = await request.json().catch(() => ({}));
    const reservationId = String(body.reservation_id || "").trim();
    const customerToken = String(body.customer_token || "").trim();

    if (!reservationId) return NextResponse.json({ error: "Missing reservation." }, { status: 400 });

    const { data: reservation, error: reservationError } = await supabaseAdmin
      .from("location_reservations")
      .select("*, locations:location_id(id,name,restaurant_name,activity_name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled)")
      .eq("id", reservationId)
      .maybeSingle();
    if (reservationError) return NextResponse.json({ error: reservationError.message }, { status: 500 });
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const ownsReservation =
      (user?.id && reservation.user_id === user.id) ||
      (user?.email && reservation.customer_email === user.email) ||
      (customerToken && customerToken === String(reservation.customer_token || ""));
    if (!ownsReservation) return NextResponse.json({ error: "Not allowed to secure this reservation." }, { status: 403 });

    if (!reservation.guarantee_required) {
      return NextResponse.json({ error: "This reservation does not require a card guarantee." }, { status: 400 });
    }
    if (reservation.guarantee_status === "active") {
      return NextResponse.json({ error: "This reservation already has an active card guarantee." }, { status: 409 });
    }
    if (["charged", "released", "waived"].includes(String(reservation.guarantee_status || ""))) {
      return NextResponse.json({ error: "This reservation guarantee can no longer be changed." }, { status: 409 });
    }

    const location = Array.isArray(reservation.locations) ? reservation.locations[0] : reservation.locations;
    if (!location?.stripe_connect_account_id || !location?.stripe_connect_charges_enabled || !location?.stripe_connect_payouts_enabled) {
      return NextResponse.json({ error: "This business has not completed TheOutHaven Payments setup." }, { status: 409 });
    }

    const decisions = await Promise.all([
      getFraudDecision("reservation", reservationId),
      getFraudDecision("location", String(reservation.location_id)),
      getFraudDecision("payout", `connect-account:${location.stripe_connect_account_id}`),
      ...(user?.id ? [getFraudDecision("user", user.id)] : []),
    ]);
    if (decisions.some(fraudDecisionPreventsSensitiveAction)) {
      return NextResponse.json({ error: "Card guarantee setup is temporarily unavailable." }, { status: 409 });
    }

    const token = customerToken || String(reservation.customer_token || "");
    const siteUrl = getSiteUrl();
    const returnPath = `/reserve/confirmation/${encodeURIComponent(token)}`;
    const params = new URLSearchParams({
      mode: "setup",
      success_url: `${siteUrl}/api/reservations/complete-guarantee-checkout?reservation_id=${encodeURIComponent(reservationId)}&customer_token=${encodeURIComponent(token)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}${returnPath}?guarantee=cancelled`,
      customer_email: reservation.customer_email || user?.email || "",
      integration_identifier: integrationIdentifier(),
      "setup_intent_data[usage]": "off_session",
      "setup_intent_data[metadata][type]": "reservation_guarantee",
      "setup_intent_data[metadata][reservation_id]": reservationId,
      "setup_intent_data[metadata][location_id]": reservation.location_id,
      "metadata[type]": "reservation_guarantee",
      "metadata[reservation_id]": reservationId,
      "metadata[location_id]": reservation.location_id,
    });
    if (user?.id) params.set("setup_intent_data[metadata][user_id]", user.id);

    const session = await stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions", {
      body: params,
      stripeAccount: location.stripe_connect_account_id,
      idempotencyKey: `reservation-guarantee-checkout-${reservationId}`,
    });
    if (!session.url) return NextResponse.json({ error: "Unable to create card guarantee setup." }, { status: 500 });

    const { error: updateError } = await supabaseAdmin
      .from("location_reservations")
      .update({ guarantee_status: "pending", updated_at: new Date().toISOString() })
      .eq("id", reservationId);
    if (updateError) throw updateError;

    return NextResponse.json({ checkout_url: session.url, checkout_session_id: session.id, status: "pending" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create card guarantee setup." }, { status: 500 });
  }
}
