import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { stripeRequest } from "@/lib/stripe/server";

function toCents(value: unknown) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.round(numeric * 100);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const body = await request.json();
    const reservationId = String(body.reservation_id || "").trim();

    if (!reservationId) {
      return NextResponse.json({ error: "Missing reservation." }, { status: 400 });
    }

    const { data: reservation, error: reservationError } = await supabaseAdmin
      .from("location_reservations")
      .select("*, locations:location_id(id, deposits_enabled, default_deposit_amount, deposit_type, name, restaurant_name, activity_name, stripe_connect_account_id, stripe_connect_charges_enabled, stripe_connect_payouts_enabled)")
      .eq("id", reservationId)
      .maybeSingle();

    if (reservationError) return NextResponse.json({ error: reservationError.message }, { status: 500 });
    if (!reservation) return NextResponse.json({ error: "Reservation not found." }, { status: 404 });

    const ownsReservation =
      (user?.id && reservation.user_id === user.id) ||
      (user?.email && reservation.customer_email === user.email) ||
      String(body.customer_token || "") === String(reservation.customer_token || "");

    if (!ownsReservation) {
      return NextResponse.json({ error: "Not allowed to pay this deposit." }, { status: 403 });
    }

    const location = Array.isArray(reservation.locations) ? reservation.locations[0] : reservation.locations;
    const depositAmount = Number(reservation.deposit_amount || location?.default_deposit_amount || 0);
    const amount = toCents(depositAmount);

    if (!location?.deposits_enabled && !reservation.deposit_required) {
      return NextResponse.json({ error: "This reservation does not require a deposit." }, { status: 400 });
    }

    if (amount < 50) {
      return NextResponse.json({ error: "Deposit amount must be at least $0.50." }, { status: 400 });
    }

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

    if (reservation.deposit_status === "paid") {
      return NextResponse.json({ error: "This reservation deposit is already paid." }, { status: 409 });
    }

    const platformFeeBps = Math.max(0, Math.min(10000, Number(process.env.STRIPE_DEPOSIT_PLATFORM_FEE_BPS || 0)));
    const applicationFee = Math.floor(amount * platformFeeBps / 10000);

    const paymentIntent = await stripeRequest<{ id: string; client_secret?: string }>("/payment_intents", {
      body: new URLSearchParams({
        amount: String(amount),
        currency: "usd",
        "automatic_payment_methods[enabled]": "true",
        description: `TheOutHaven reservation deposit ${reservationId}`,
        receipt_email: reservation.customer_email || user?.email || "",
        "metadata[reservation_id]": reservationId,
        "metadata[location_id]": reservation.location_id,
        "metadata[type]": "reservation_deposit",
        ...(user?.id ? { "metadata[user_id]": user.id } : {}),
        "transfer_data[destination]": location.stripe_connect_account_id,
        on_behalf_of: location.stripe_connect_account_id,
        ...(applicationFee > 0 ? { application_fee_amount: String(applicationFee) } : {}),
      }),
      idempotencyKey: `reservation-deposit-${reservationId}-${amount}`,
    });

    const { error: updateError } = await supabaseAdmin
      .from("location_reservations")
      .update({
        deposit_required: true,
        deposit_amount: depositAmount,
        deposit_status: "pending",
        stripe_payment_intent_id: paymentIntent.id,
        deposit_platform_fee_cents: applicationFee,
        deposit_connected_account_id: location.stripe_connect_account_id,
      })
      .eq("id", reservationId);
    if (updateError) throw updateError;

    return NextResponse.json({
      payment_intent_id: paymentIntent.id,
      client_secret: paymentIntent.client_secret,
      amount: depositAmount,
      status: "pending",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create deposit payment." },
      { status: 500 },
    );
  }
}
