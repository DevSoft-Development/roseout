import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

function toCents(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
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
      .select("*, locations:location_id(id,deposits_enabled,default_deposit_amount,name,restaurant_name,activity_name,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled)")
      .eq("id", reservationId)
      .maybeSingle();
    if (reservationError) return NextResponse.json({ error: reservationError.message }, { status: 500 });
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const ownsReservation =
      (user?.id && reservation.user_id === user.id) ||
      (user?.email && reservation.customer_email === user.email) ||
      (customerToken && customerToken === String(reservation.customer_token || ""));
    if (!ownsReservation) return NextResponse.json({ error: "Not allowed to pay this deposit." }, { status: 403 });

    const location = Array.isArray(reservation.locations) ? reservation.locations[0] : reservation.locations;
    const depositAmount = Number(reservation.deposit_amount || location?.default_deposit_amount || 0);
    const amount = toCents(depositAmount);

    if (!location?.deposits_enabled && !reservation.deposit_required) {
      return NextResponse.json({ error: "This reservation does not require a deposit." }, { status: 400 });
    }
    if (amount < 50) return NextResponse.json({ error: "Deposit amount must be at least $0.50." }, { status: 400 });
    if (reservation.deposit_status === "paid") return NextResponse.json({ error: "This reservation deposit is already paid." }, { status: 409 });

    if (!location?.stripe_connect_account_id || !location?.stripe_connect_charges_enabled || !location?.stripe_connect_payouts_enabled) {
      return NextResponse.json({ error: "This business has not completed Stripe deposit onboarding." }, { status: 409 });
    }

    const riskChecks = [
      getFraudDecision("reservation", reservationId),
      getFraudDecision("location", String(reservation.location_id)),
      getFraudDecision("payout", `connect-account:${location.stripe_connect_account_id}`),
    ];
    if (user?.id) riskChecks.push(getFraudDecision("user", user.id));
    if ((await Promise.all(riskChecks)).some(fraudDecisionPreventsSensitiveAction)) {
      return NextResponse.json({ error: "This deposit is temporarily unavailable." }, { status: 409 });
    }

    const platformFeeBps = Math.max(0, Math.min(10000, Number(process.env.STRIPE_DEPOSIT_PLATFORM_FEE_BPS || 0)));
    const applicationFee = Math.floor(amount * platformFeeBps / 10000);
    const siteUrl = getSiteUrl();
    const returnPath = `/reserve/confirmation/${encodeURIComponent(customerToken || String(reservation.customer_token || ""))}`;
    const locationName = String(location.name || location.restaurant_name || location.activity_name || "TheOutHaven reservation");

    const params = new URLSearchParams({
      mode: "payment",
      success_url: `${siteUrl}${returnPath}?deposit=success`,
      cancel_url: `${siteUrl}${returnPath}?deposit=cancelled`,
      customer_email: reservation.customer_email || user?.email || "",
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": "usd",
      "line_items[0][price_data][unit_amount]": String(amount),
      "line_items[0][price_data][product_data][name]": `Reservation deposit — ${locationName}`,
      "payment_intent_data[metadata][reservation_id]": reservationId,
      "payment_intent_data[metadata][location_id]": reservation.location_id,
      "payment_intent_data[metadata][type]": "reservation_deposit",
      "payment_intent_data[transfer_data][destination]": location.stripe_connect_account_id,
      "payment_intent_data[on_behalf_of]": location.stripe_connect_account_id,
      "metadata[reservation_id]": reservationId,
      "metadata[location_id]": reservation.location_id,
      "metadata[type]": "reservation_deposit",
    });
    if (user?.id) params.set("payment_intent_data[metadata][user_id]", user.id);
    if (applicationFee > 0) params.set("payment_intent_data[application_fee_amount]", String(applicationFee));

    const session = await stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions", {
      body: params,
      idempotencyKey: `reservation-deposit-checkout-${reservationId}-${amount}`,
    });
    if (!session.url) return NextResponse.json({ error: "Unable to create deposit checkout." }, { status: 500 });

    const { error: updateError } = await supabaseAdmin
      .from("location_reservations")
      .update({
        deposit_required: true,
        deposit_amount: depositAmount,
        deposit_status: "pending",
        deposit_platform_fee_cents: applicationFee,
        deposit_connected_account_id: location.stripe_connect_account_id,
      })
      .eq("id", reservationId);
    if (updateError) throw updateError;

    return NextResponse.json({ checkout_url: session.url, checkout_session_id: session.id, amount: depositAmount, status: "pending" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create deposit checkout." }, { status: 500 });
  }
}
