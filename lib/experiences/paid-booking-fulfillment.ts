import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deliverExperienceBooking, deliverExperienceHostNotification } from "@/lib/experiences/booking-delivery";

function deliveryStatus(attempted: boolean, sent: boolean) {
  if (!attempted) return "skipped";
  return sent ? "sent" : "failed";
}

async function resolveHost(experience: { location_id: string | null; organization_id: string | null }) {
  if (experience.location_id) {
    const { data: location } = await supabaseAdmin.from("locations").select("name,owner_email,owner_phone").eq("id", experience.location_id).maybeSingle();
    return {
      name: location?.name || "Location team",
      emails: location?.owner_email ? [location.owner_email] : [],
      phone: location?.owner_phone || null,
      managePath: `/locations/dashboard/reservations?locationId=${encodeURIComponent(experience.location_id)}&host=1`,
    };
  }
  if (experience.organization_id) {
    const [{ data: organization }, { data: profile }, { data: members }] = await Promise.all([
      supabaseAdmin.from("organizations").select("name").eq("id", experience.organization_id).maybeSingle(),
      supabaseAdmin.from("organizer_profiles").select("display_name,phone").eq("organization_id", experience.organization_id).maybeSingle(),
      supabaseAdmin.from("organization_members").select("email,status").eq("organization_id", experience.organization_id).limit(20),
    ]);
    const blocked = new Set(["invited", "pending", "removed", "disabled", "suspended"]);
    return {
      name: profile?.display_name || organization?.name || "Organizer team",
      emails: (members || []).filter((member) => member.email && !blocked.has(String(member.status || "").toLowerCase())).map((member) => String(member.email)),
      phone: profile?.phone || null,
      managePath: `/organizers/dashboard/experiences?organizationId=${encodeURIComponent(experience.organization_id)}`,
    };
  }
  return null;
}

export async function fulfillPaidExperienceBooking(bookingId: string, paymentIntentId?: string | null) {
  const { data: booking, error: bookingError } = await supabaseAdmin
    .from("experience_bookings")
    .select("id,experience_id,slot_id,customer_name,customer_email,customer_phone,party_size,public_token,checkin_code,status,payment_status,email_delivery_status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bookingError) throw bookingError;
  if (!booking) throw new Error("Experience booking not found.");
  if (booking.payment_status === "paid" && booking.status === "confirmed" && booking.email_delivery_status === "sent") return booking;

  const [{ data: experience, error: experienceError }, { data: slot, error: slotError }] = await Promise.all([
    supabaseAdmin.from("experiences").select("id,title,location_id,organization_id").eq("id", booking.experience_id).maybeSingle(),
    supabaseAdmin.from("experience_slots").select("starts_at").eq("id", booking.slot_id).maybeSingle(),
  ]);
  if (experienceError) throw experienceError;
  if (slotError) throw slotError;
  if (!experience || !slot) throw new Error("Experience or scheduled time not found.");

  const now = new Date().toISOString();
  const { error: paidError } = await supabaseAdmin.from("experience_bookings").update({
    status: "confirmed",
    payment_status: "paid",
    provider_payment_intent_id: paymentIntentId || null,
    paid_at: now,
    updated_at: now,
  }).eq("id", bookingId);
  if (paidError) throw paidError;

  const [delivery, host] = await Promise.all([
    deliverExperienceBooking({
      customerName: booking.customer_name,
      email: booking.customer_email,
      phone: booking.customer_phone,
      experienceTitle: experience.title,
      startsAt: slot.starts_at,
      publicToken: booking.public_token,
      checkinCode: booking.checkin_code,
    }),
    resolveHost(experience),
  ]);
  const hostDelivery = host ? await deliverExperienceHostNotification({
    hostName: host.name,
    emails: host.emails,
    phone: host.phone,
    experienceTitle: experience.title,
    startsAt: slot.starts_at,
    customerName: booking.customer_name,
    partySize: booking.party_size,
    managePath: host.managePath,
  }) : { email: { attempted: false, sent: false }, sms: { attempted: false, sent: false } };

  await supabaseAdmin.from("experience_bookings").update({
    email_delivery_status: deliveryStatus(delivery.email.attempted, delivery.email.sent),
    sms_delivery_status: deliveryStatus(delivery.sms.attempted, delivery.sms.sent),
    delivery_error: [delivery.email.error, delivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null,
    delivery_attempted_at: now,
    host_email_delivery_status: deliveryStatus(hostDelivery.email.attempted, hostDelivery.email.sent),
    host_sms_delivery_status: deliveryStatus(hostDelivery.sms.attempted, hostDelivery.sms.sent),
    host_delivery_error: [hostDelivery.email.error, hostDelivery.sms.error].filter(Boolean).join(" | ").slice(0, 600) || null,
    host_delivery_attempted_at: now,
    updated_at: now,
  }).eq("id", bookingId);

  return booking;
}
