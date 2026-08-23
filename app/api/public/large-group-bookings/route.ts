import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { checkReservationAvailability, clearExpiredSlotLocks } from "@/lib/reservations/availability";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

function clean(value: unknown, max = 500) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function integrationIdentifier(prefix: string) { return `${prefix}-${randomBytes(4).toString("hex")}`; }
function corsHeaders(request: NextRequest) {
  const origin = request.headers.get("origin") || "";
  const allowed = origin && (/^https:\/\/([a-z0-9-]+\.)?theouthaven\.com$/i.test(origin) || /^https:\/\/[a-z0-9.-]+$/i.test(origin));
  return { "Access-Control-Allow-Origin": allowed ? origin : "https://www.theouthaven.com", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", Vary: "Origin" };
}
export async function OPTIONS(request: NextRequest) { return new NextResponse(null, { status: 204, headers: corsHeaders(request) }); }

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request);
  let lockId: string | null = null;
  let reservationId: string | null = null;
  try {
    const body = await request.json().catch(() => ({}));
    const locationId = clean(body.locationId || body.location_id, 80);
    const customerName = clean(body.customerName || body.customer_name, 120);
    const customerEmail = clean(body.customerEmail || body.customer_email, 254).toLowerCase();
    const customerPhone = clean(body.customerPhone || body.customer_phone, 40);
    const reservationDate = clean(body.reservationDate || body.reservation_date, 10);
    const reservationTime = clean(body.reservationTime || body.reservation_time, 5);
    const partySize = Number(body.partySize || body.party_size || 0);
    const occasion = clean(body.occasion, 80) || null;
    const rawPrixFixe = clean(body.prixFixeInterest || body.prix_fixe_interest, 20).toLowerCase();
    const notes = clean(body.notes || body.groupBookingNotes || body.group_booking_notes, 1200) || null;

    if (!locationId || !customerName || !EMAIL_RE.test(customerEmail) || !DATE_RE.test(reservationDate) || !TIME_RE.test(reservationTime)) {
      return NextResponse.json({ error: "Complete the required group booking details." }, { status: 400, headers });
    }

    const { data: location, error: locationError } = await supabaseAdmin.from("locations").select("id,location_type,name,restaurant_name,activity_name,large_group_booking_enabled,large_group_min_party_size,large_group_max_party_size,large_group_confirmation_mode,large_group_payment_mode,large_group_deposit_type,large_group_deposit_amount_cents,large_group_prix_fixe_mode,large_group_default_duration_minutes,reservation_cancel_cutoff_hours,reservation_late_cancel_fee_type,reservation_late_cancel_fee_cents,reservation_no_show_fee_type,reservation_no_show_fee_cents,stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled").eq("id", locationId).maybeSingle();
    if (locationError) throw locationError;
    if (!location) return NextResponse.json({ error: "Location not found." }, { status: 404, headers });
    if (!location.large_group_booking_enabled) return NextResponse.json({ error: "Large group booking is not enabled for this location." }, { status: 409, headers });

    const minParty = Number(location.large_group_min_party_size || 8);
    const maxParty = Number(location.large_group_max_party_size || 40);
    if (!Number.isInteger(partySize) || partySize < minParty || partySize > maxParty) {
      return NextResponse.json({ error: `Large group bookings must be for ${minParty} to ${maxParty} guests.` }, { status: 400, headers });
    }

    const prixFixeMode = String(location.large_group_prix_fixe_mode || "optional");
    const prixFixeInterest = prixFixeMode === "required" ? "yes" : ["yes", "no", "unsure"].includes(rawPrixFixe) ? rawPrixFixe : "unsure";
    const durationMinutes = Number(location.large_group_default_duration_minutes || 180);
    const paymentMode = String(location.large_group_payment_mode || "none") as "none" | "card_guarantee" | "deposit";

    await clearExpiredSlotLocks();
    const initial = await checkReservationAvailability({ location_id: locationId, reservation_date: reservationDate, reservation_time: reservationTime, party_size: partySize });
    if (!initial.available) return NextResponse.json({ error: initial.reason || "That time is no longer available." }, { status: 409, headers });

    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { data: lock, error: lockError } = await supabaseAdmin.from("reservation_slot_locks").insert({ location_id: locationId, reservation_date: reservationDate, reservation_time: reservationTime, party_size: partySize, expires_at: expiresAt }).select("id").single();
    if (lockError) throw lockError;
    lockId = lock.id;

    const afterLock = await checkReservationAvailability({ location_id: locationId, reservation_date: reservationDate, reservation_time: reservationTime, party_size: partySize, exclude_lock_id: lockId });
    if (!afterLock.available) {
      await supabaseAdmin.from("reservation_slot_locks").delete().eq("id", lockId);
      lockId = null;
      return NextResponse.json({ error: "That time was just booked. Choose another available time." }, { status: 409, headers });
    }

    const customerToken = randomBytes(24).toString("base64url");
    const tokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const status = paymentMode === "deposit" || paymentMode === "card_guarantee" ? "pending" : String(location.large_group_confirmation_mode || "approval") === "instant" ? "confirmed" : "pending";
    const depositCents = paymentMode === "deposit" ? Number(location.large_group_deposit_amount_cents || 0) * (String(location.large_group_deposit_type || "flat") === "per_person" ? partySize : 1) : 0;
    const specialRequest = [occasion ? `Occasion: ${occasion}` : "", `Prix-fixe interest: ${prixFixeInterest}`, notes || ""].filter(Boolean).join("\n");

    const { data: reservation, error } = await supabaseAdmin.from("location_reservations").insert({
      location_id: location.id,
      location_type: String(location.location_type || "restaurant"),
      customer_name: customerName,
      customer_email: customerEmail,
      customer_phone: customerPhone || null,
      reservation_date: reservationDate,
      reservation_time: reservationTime,
      party_size: partySize,
      status,
      source: "public_large_group",
      booking_kind: "large_group",
      occasion,
      prix_fixe_interest: prixFixeInterest,
      group_booking_notes: notes,
      special_request: specialRequest,
      special_requests: specialRequest,
      duration_minutes: durationMinutes,
      customer_token: customerToken,
      customer_token_expires_at: tokenExpiresAt,
      large_group_payment_mode: paymentMode,
      guarantee_required: paymentMode === "card_guarantee",
      guarantee_status: paymentMode === "card_guarantee" ? "pending" : "not_required",
      guarantee_cancel_cutoff_hours: paymentMode === "card_guarantee" ? Number(location.reservation_cancel_cutoff_hours || 6) : null,
      guarantee_late_cancel_fee_type: paymentMode === "card_guarantee" ? String(location.reservation_late_cancel_fee_type || "flat") : null,
      guarantee_late_cancel_fee_cents: paymentMode === "card_guarantee" ? Number(location.reservation_late_cancel_fee_cents || 0) : null,
      guarantee_no_show_fee_type: paymentMode === "card_guarantee" ? String(location.reservation_no_show_fee_type || "flat") : null,
      guarantee_no_show_fee_cents: paymentMode === "card_guarantee" ? Number(location.reservation_no_show_fee_cents || 0) : null,
      deposit_required: paymentMode === "deposit",
      deposit_amount: depositCents / 100,
      deposit_status: paymentMode === "deposit" ? "pending" : "not_required",
      updated_at: new Date().toISOString(),
    }).select("id,status").single();
    if (error) throw error;
    reservationId = reservation.id;

    await supabaseAdmin.from("reservation_slot_locks").delete().eq("id", lockId);
    lockId = null;

    if (paymentMode === "card_guarantee") {
      if (!location.stripe_connect_account_id || !location.stripe_connect_charges_enabled || !location.stripe_connect_payouts_enabled) {
        throw new Error("This location has not completed TheOutHaven Payments setup for card guarantees.");
      }
      const siteUrl = getSiteUrl();
      const params = new URLSearchParams({
        mode: "setup",
        success_url: `${siteUrl}/api/reservations/complete-guarantee-checkout?reservation_id=${encodeURIComponent(reservation.id)}&customer_token=${encodeURIComponent(customerToken)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${siteUrl}/reserve/confirmation/${encodeURIComponent(customerToken)}?guarantee=cancelled`,
        customer_email: customerEmail,
        integration_identifier: integrationIdentifier("tohgrpguar"),
        "setup_intent_data[usage]": "off_session",
        "setup_intent_data[metadata][type]": "reservation_guarantee",
        "setup_intent_data[metadata][reservation_id]": reservation.id,
        "setup_intent_data[metadata][location_id]": location.id,
        "metadata[type]": "reservation_guarantee",
        "metadata[reservation_id]": reservation.id,
        "metadata[location_id]": location.id,
      });
      const session = await stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions", {
        body: params,
        stripeAccount: String(location.stripe_connect_account_id),
        idempotencyKey: `large-group-guarantee-${reservation.id}`,
      });
      if (!session.url) throw new Error("Unable to create the card guarantee setup.");
      return NextResponse.json({ ok: true, reservationId: reservation.id, status: reservation.status, checkoutUrl: session.url, paymentMode, customerToken, guaranteeRequired: true, message: "Secure a card to hold this large group booking. Nothing is charged today." }, { status: 201, headers });
    }

    if (paymentMode === "deposit") {
      if (depositCents < 50) throw new Error("Large group deposit must be at least $0.50.");
      if (!location.stripe_connect_account_id || !location.stripe_connect_charges_enabled || !location.stripe_connect_payouts_enabled) {
        throw new Error("This location has not completed TheOutHaven Payments setup for large group deposits.");
      }
      const siteUrl = getSiteUrl();
      const locationName = String(location.name || location.restaurant_name || location.activity_name || "TheOutHaven location");
      const params = new URLSearchParams({
        mode: "payment",
        success_url: `${siteUrl}/reserve/confirmation/${encodeURIComponent(customerToken)}?deposit=success`,
        cancel_url: `${siteUrl}/reserve/confirmation/${encodeURIComponent(customerToken)}?deposit=cancelled`,
        customer_email: customerEmail,
        integration_identifier: integrationIdentifier("tohgrpdep"),
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": "usd",
        "line_items[0][price_data][unit_amount]": String(depositCents),
        "line_items[0][price_data][product_data][name]": `Large group booking deposit — ${locationName}`,
        "payment_intent_data[metadata][reservation_id]": reservation.id,
        "payment_intent_data[metadata][location_id]": location.id,
        "payment_intent_data[metadata][type]": "reservation_deposit",
        "metadata[reservation_id]": reservation.id,
        "metadata[location_id]": location.id,
        "metadata[type]": "reservation_deposit",
      });
      const session = await stripeRequest<{ id: string; url?: string | null }>("/checkout/sessions", {
        body: params,
        stripeAccount: String(location.stripe_connect_account_id),
        idempotencyKey: `large-group-deposit-${reservation.id}-${depositCents}`,
      });
      if (!session.url) throw new Error("Unable to create the large group deposit checkout.");
      await supabaseAdmin.from("location_reservations").update({ deposit_platform_fee_cents: 0, deposit_connected_account_id: location.stripe_connect_account_id }).eq("id", reservation.id);
      return NextResponse.json({ ok: true, reservationId: reservation.id, status: reservation.status, checkoutUrl: session.url, paymentMode, message: "Complete the deposit to secure this large group booking." }, { status: 201, headers });
    }

    return NextResponse.json({
      ok: true,
      reservationId: reservation.id,
      status: reservation.status,
      paymentMode,
      customerToken,
      guaranteeRequired: false,
      message: reservation.status === "confirmed" ? "Your large group booking is confirmed." : "Your large group booking is held for location approval.",
    }, { status: 201, headers });
  } catch (error) {
    if (lockId) await supabaseAdmin.from("reservation_slot_locks").delete().eq("id", lockId);
    if (reservationId) await supabaseAdmin.from("location_reservations").delete().eq("id", reservationId).eq("status", "pending");
    console.error("PUBLIC_LARGE_GROUP_BOOKING_ERROR", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "We could not create your group booking." }, { status: 500, headers });
  }
}
