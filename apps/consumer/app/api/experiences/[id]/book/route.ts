import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deliverExperienceBooking, deliverExperienceHostNotification } from "@/lib/experiences/booking-delivery";
import { fraudDecisionPreventsSensitiveAction, getFraudDecision } from "@/lib/fraud";
import { fraudGuardResponse } from "@/lib/fraud-response";
import { getSiteUrl, stripeRequest } from "@/lib/stripe/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(length = 6) {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

function integrationIdentifier() {
  return `tohexp-${randomBytes(4).toString("hex")}`;
}

function deliveryStatus(attempted: boolean, sent: boolean) {
  if (!attempted) return "skipped";
  return sent ? "sent" : "failed";
}

async function resolveHost(experience: { location_id: string | null; organization_id: string | null; title: string }) {
  if (experience.location_id) {
    const { data: location } = await supabaseAdmin.from("locations").select("id,name,owner_email,owner_phone").eq("id", experience.location_id).maybeSingle();
    return { name: location?.name || "Location team", emails: location?.owner_email ? [location.owner_email] : [], phone: location?.owner_phone || null, managePath: `/locations/dashboard/reservations?locationId=${encodeURIComponent(experience.location_id)}&host=1` };
  }
  if (experience.organization_id) {
    const [{ data: organization }, { data: profile }, { data: members }] = await Promise.all([
      supabaseAdmin.from("organizations").select("id,name").eq("id", experience.organization_id).maybeSingle(),
      supabaseAdmin.from("organizer_profiles").select("display_name,phone").eq("organization_id", experience.organization_id).maybeSingle(),
      supabaseAdmin.from("organization_members").select("email,status").eq("organization_id", experience.organization_id).limit(20),
    ]);
    const blockedStatuses = new Set(["invited", "pending", "removed", "disabled", "suspended"]);
    const emails = (members || []).filter((member) => member.email && !blockedStatuses.has(String(member.status || "").toLowerCase())).map((member) => String(member.email));
    return { name: profile?.display_name || organization?.name || "Organizer team", emails, phone: profile?.phone || null, managePath: `/organizers/dashboard/experiences?organizationId=${encodeURIComponent(experience.organization_id)}` };
  }
  return null;
}

async function resolveConnectedAccount(experience: { location_id: string | null; organization_id: string | null }) {
  const table = experience.location_id ? "locations" : "organizations";
  const id = experience.location_id || experience.organization_id;
  if (!id) return null;
  const { data, error } = await supabaseAdmin.from(table).select("stripe_connect_account_id,stripe_connect_charges_enabled,stripe_connect_payouts_enabled").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data?.stripe_connect_account_id || !data.stripe_connect_charges_enabled || !data.stripe_connect_payouts_enabled) return null;
  return String(data.stripe_connect_account_id);
}

function calculatePrice(experience: any, partySize: number) {
  const model = String(experience.pricing_model || "per_person");
  if (model === "free") return { amountCents: 0, tablesReserved: null };
  if (model === "per_person") return { amountCents: Math.round(Number(experience.price_per_person || 0) * partySize * 100), tablesReserved: null };
  if (model === "per_table") {
    const seats = Math.max(1, Number(experience.seats_per_table || 1));
    const tablesReserved = Math.ceil(partySize / seats);
    return { amountCents: Math.round(Number(experience.price_per_table || 0) * tablesReserved * 100), tablesReserved };
  }
  return { amountCents: Math.round(Number(experience.price_per_table || 0) * 100), tablesReserved: 1 };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const slotId = String(body.slotId || "");
  const customerName = String(body.customerName || "").trim();
  const customerEmail = String(body.customerEmail || "").trim().toLowerCase();
  const customerPhone = String(body.customerPhone || "").trim() || null;
  const partySize = Number(body.partySize || 1);
  if (!slotId || !customerName || !customerEmail || !Number.isInteger(partySize) || partySize < 1) return NextResponse.json({ error: "Missing or invalid booking details." }, { status: 400 });

  const [{ data: experience }, { data: slot }] = await Promise.all([
    supabaseAdmin.from("experiences").select("id,title,min_party_size,max_party_size,status,searchable,location_id,organization_id,experience_type,pricing_model,price_per_person,price_per_table,seats_per_table,prepayment_required,currency").eq("id", id).maybeSingle(),
    supabaseAdmin.from("experience_slots").select("id,experience_id,starts_at,ends_at,capacity,tables_available,status").eq("id", slotId).eq("experience_id", id).maybeSingle(),
  ]);
  if (!experience || experience.status !== "published" || !experience.searchable || !slot || slot.status !== "open") return NextResponse.json({ error: "This experience or time slot is unavailable." }, { status: 404 });

  const riskChecks = [getFraudDecision("experience", id)];
  if (experience.location_id) riskChecks.push(getFraudDecision("location", String(experience.location_id)));
  if (experience.organization_id) riskChecks.push(getFraudDecision("organizer", String(experience.organization_id)));
  if (user?.id) riskChecks.push(getFraudDecision("user", user.id));
  if ((await Promise.all(riskChecks)).some(fraudDecisionPreventsSensitiveAction)) return NextResponse.json({ error: "This experience is temporarily unavailable." }, { status: 409 });

  if (partySize < experience.min_party_size || partySize > experience.max_party_size) return NextResponse.json({ error: `Party size must be between ${experience.min_party_size} and ${experience.max_party_size}.` }, { status: 400 });
  if (new Date(slot.starts_at).getTime() <= Date.now()) return NextResponse.json({ error: "This time slot has already started." }, { status: 409 });

  const { amountCents, tablesReserved } = calculatePrice(experience, partySize);
  const pendingCutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  const { data: existing, error: countError } = await supabaseAdmin.from("experience_bookings").select("party_size,tables_reserved,status,created_at").eq("slot_id", slotId).in("status", ["confirmed", "pending_payment"]);
  if (countError) throw countError;
  const active = (existing || []).filter((row) => row.status === "confirmed" || new Date(row.created_at).toISOString() >= pendingCutoff);
  const reservedGuests = active.reduce((sum, row) => sum + Number(row.party_size || 0), 0);
  if (reservedGuests + partySize > slot.capacity) return NextResponse.json({ error: "Not enough availability remains for that party size." }, { status: 409 });
  if (tablesReserved && slot.tables_available) {
    const reservedTables = active.reduce((sum, row) => sum + Number(row.tables_reserved || 0), 0);
    if (reservedTables + tablesReserved > slot.tables_available) return NextResponse.json({ error: "Not enough tables remain for that party size." }, { status: 409 });
  }

  let checkinCode = makeCode();
  for (let i = 0; i < 4; i += 1) {
    const { data } = await supabaseAdmin.from("experience_bookings").select("id").eq("checkin_code", checkinCode).maybeSingle();
    if (!data) break;
    checkinCode = makeCode();
  }
  const publicToken = randomBytes(24).toString("base64url");
  const requiresPayment = Boolean(experience.prepayment_required && amountCents > 0);
  const { data: booking, error } = await supabaseAdmin.from("experience_bookings").insert({
    experience_id: id,
    slot_id: slotId,
    customer_user_id: user?.id || null,
    customer_name: customerName,
    customer_email: customerEmail,
    customer_phone: customerPhone,
    party_size: partySize,
    public_token: publicToken,
    checkin_code: checkinCode,
    status: requiresPayment ? "pending_payment" : "confirmed",
    payment_status: requiresPayment ? "pending" : "not_required",
    amount_cents: amountCents,
    pricing_model: experience.pricing_model,
    tables_reserved: tablesReserved,
  }).select("id,public_token,checkin_code").single();
  if (error) {
    const guarded = fraudGuardResponse(error, "This experience is temporarily unavailable while the booking is under review.");
    if (guarded) return guarded;
    throw error;
  }

  if (requiresPayment) {
    const connectedAccountId = await resolveConnectedAccount(experience);
    if (!connectedAccountId) {
      await supabaseAdmin.from("experience_bookings").delete().eq("id", booking.id).eq("status", "pending_payment");
      return NextResponse.json({ error: "This location must finish TheOutHaven Payments setup before prepaid experiences can be sold." }, { status: 409 });
    }
    const payoutDecision = await getFraudDecision("payout", `connect-account:${connectedAccountId}`);
    if (fraudDecisionPreventsSensitiveAction(payoutDecision)) {
      await supabaseAdmin.from("experience_bookings").delete().eq("id", booking.id).eq("status", "pending_payment");
      return NextResponse.json({ error: "Prepaid booking is temporarily unavailable." }, { status: 409 });
    }

    try {
      const siteUrl = getSiteUrl();
      const platformFeeBps = 300;
      const applicationFee = Math.floor(amountCents * platformFeeBps / 10000);
      const currency = String(experience.currency || "USD").toLowerCase();
      const params = new URLSearchParams({
        mode: "payment",
        success_url: `${siteUrl}/experiences/${encodeURIComponent(id)}?payment=success&booking=${encodeURIComponent(booking.id)}`,
        cancel_url: `${siteUrl}/experiences/${encodeURIComponent(id)}?payment=cancelled`,
        customer_email: customerEmail,
        integration_identifier: integrationIdentifier(),
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": currency,
        "line_items[0][price_data][unit_amount]": String(amountCents),
        "line_items[0][price_data][product_data][name]": experience.title,
        "payment_intent_data[metadata][type]": "experience_booking",
        "payment_intent_data[metadata][booking_id]": booking.id,
        "payment_intent_data[metadata][experience_id]": id,
        "payment_intent_data[metadata][location_id]": experience.location_id || "",
        "payment_intent_data[metadata][organization_id]": experience.organization_id || "",
        "metadata[type]": "experience_booking",
        "metadata[booking_id]": booking.id,
        "metadata[experience_id]": id,
        "metadata[location_id]": experience.location_id || "",
        "metadata[organization_id]": experience.organization_id || "",
        expires_at: String(Math.floor(Date.now() / 1000) + 30 * 60),
      });
      if (user?.id) {
        params.set("payment_intent_data[metadata][user_id]", user.id);
        params.set("metadata[user_id]", user.id);
      }
      if (applicationFee > 0) params.set("payment_intent_data[application_fee_amount]", String(applicationFee));
      const session = await stripeRequest<{ id: string; url: string | null; payment_intent?: string | null }>("/checkout/sessions", {
        body: params,
        idempotencyKey: `experience-checkout-${booking.id}`,
        stripeAccount: connectedAccountId,
      });
      if (!session.url) throw new Error("Stripe did not return a checkout URL.");
      const { error: updateError } = await supabaseAdmin.from("experience_bookings").update({ provider_checkout_session_id: session.id, provider_payment_intent_id: session.payment_intent || null, updated_at: new Date().toISOString() }).eq("id", booking.id);
      if (updateError) throw updateError;
      return NextResponse.json({ ok: true, bookingId: booking.id, checkoutUrl: session.url, amountCents, platformFeeBps }, { status: 201 });
    } catch (checkoutError) {
      await supabaseAdmin.from("experience_bookings").delete().eq("id", booking.id).eq("status", "pending_payment");
      return NextResponse.json({ error: checkoutError instanceof Error ? checkoutError.message : "Unable to start checkout." }, { status: 500 });
    }
  }

  const [delivery, host] = await Promise.all([
    deliverExperienceBooking({ customerName, email: customerEmail, phone: customerPhone, experienceTitle: experience.title, startsAt: slot.starts_at, publicToken: booking.public_token, checkinCode: booking.checkin_code }),
    resolveHost(experience),
  ]);
  const hostDelivery = host ? await deliverExperienceHostNotification({ hostName: host.name, emails: host.emails, phone: host.phone, experienceTitle: experience.title, startsAt: slot.starts_at, customerName, partySize, managePath: host.managePath }) : { email: { attempted: false, sent: false }, sms: { attempted: false, sent: false } };
  const now = new Date().toISOString();
  await supabaseAdmin.from("experience_bookings").update({
    email_delivery_status: deliveryStatus(delivery.email.attempted, delivery.email.sent),
    sms_delivery_status: deliveryStatus(delivery.sms.attempted, delivery.sms.sent),
    delivery_error: [delivery.email.error, delivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null,
    delivery_attempted_at: now,
    host_email_delivery_status: deliveryStatus(hostDelivery.email.attempted, hostDelivery.email.sent),
    host_sms_delivery_status: deliveryStatus(hostDelivery.sms.attempted, hostDelivery.sms.sent),
    host_delivery_error: [hostDelivery.email.error, hostDelivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null,
    host_delivery_attempted_at: now,
  }).eq("id", booking.id);

  return NextResponse.json({ ok: true, bookingId: booking.id, checkinCode: booking.checkin_code, passUrl: `/experience-bookings/${booking.public_token}`, delivery: { customer: { email: deliveryStatus(delivery.email.attempted, delivery.email.sent), sms: deliveryStatus(delivery.sms.attempted, delivery.sms.sent) }, host: { email: deliveryStatus(hostDelivery.email.attempted, hostDelivery.email.sent), sms: deliveryStatus(hostDelivery.sms.attempted, hostDelivery.sms.sent) } } });
}
