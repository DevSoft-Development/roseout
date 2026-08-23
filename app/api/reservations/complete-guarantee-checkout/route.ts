import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const reservationId = String(searchParams.get("reservation_id") || "").trim();
  const customerToken = String(searchParams.get("customer_token") || "").trim();
  const sessionId = String(searchParams.get("session_id") || "").trim();
  const siteUrl = getSiteUrl();
  const returnUrl = `${siteUrl}/reserve/confirmation/${encodeURIComponent(customerToken)}`;

  try {
    if (!reservationId || !customerToken || !sessionId) {
      return NextResponse.redirect(`${returnUrl}?guarantee=failed`);
    }

    const { data: reservation, error: reservationError } = await supabaseAdmin
      .from("location_reservations")
      .select("id,location_id,customer_token,guarantee_required,guarantee_status,locations:location_id(stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled)")
      .eq("id", reservationId)
      .maybeSingle();
    if (reservationError) throw reservationError;
    if (!reservation || customerToken !== String(reservation.customer_token || "") || !reservation.guarantee_required) {
      return NextResponse.redirect(`${returnUrl}?guarantee=failed`);
    }

    if (reservation.guarantee_status === "active") {
      return NextResponse.redirect(`${returnUrl}?guarantee=success`);
    }

    const location = Array.isArray(reservation.locations) ? reservation.locations[0] : reservation.locations;
    if (!location?.stripe_connect_account_id || !location?.stripe_connect_charges_enabled || !location?.stripe_connect_payouts_enabled) {
      throw new Error("Location payments setup is incomplete.");
    }

    const session = await stripeRequest<{ id: string; status?: string; setup_intent?: string | null; metadata?: Record<string, string> }>(
      `/checkout/sessions/${encodeURIComponent(sessionId)}`,
      { method: "GET", stripeAccount: location.stripe_connect_account_id },
    );
    if (session.metadata?.reservation_id !== reservationId || session.metadata?.type !== "reservation_guarantee") {
      throw new Error("Guarantee checkout does not match this reservation.");
    }
    if (session.status !== "complete" || !session.setup_intent) {
      throw new Error("Card guarantee setup is not complete.");
    }

    const setupIntent = await stripeRequest<{ id: string; status: string; payment_method?: string | null }>(
      `/setup_intents/${encodeURIComponent(session.setup_intent)}`,
      { method: "GET", stripeAccount: location.stripe_connect_account_id },
    );
    if (setupIntent.status !== "succeeded" || !setupIntent.payment_method) {
      throw new Error("Card guarantee could not be verified.");
    }

    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("location_reservations")
      .update({
        guarantee_status: "active",
        stripe_setup_intent_id: setupIntent.id,
        stripe_payment_method_id: setupIntent.payment_method,
        guarantee_authorized_at: now,
        guarantee_released_at: null,
        updated_at: now,
      })
      .eq("id", reservationId);
    if (updateError) throw updateError;

    return NextResponse.redirect(`${returnUrl}?guarantee=success`);
  } catch (error) {
    console.error("Unable to finalize reservation guarantee", error);
    if (reservationId) {
      await supabaseAdmin
        .from("location_reservations")
        .update({ guarantee_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", reservationId)
        .eq("guarantee_status", "pending");
    }
    return NextResponse.redirect(`${returnUrl}?guarantee=failed`);
  }
}
