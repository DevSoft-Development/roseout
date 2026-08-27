import { NextResponse } from "next/server";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendRawBrandedEmail } from "@/lib/email/sender";
import { sendSms } from "@/lib/sms/sendSms";

export const dynamic = "force-dynamic";

type MessageType =
  | "completion_confirmation"
  | "upgrade_intro"
  | "photo_reminder_day3"
  | "photo_reminder_day7";

type QueueRow = {
  id: string;
  location_id: string;
  claim_request_id: string | null;
  message_type: MessageType;
  contact_channel: "email" | "sms" | null;
  contact: string | null;
  status: string;
  due_at: string;
  attempt_count: number;
  metadata: Record<string, unknown> | null;
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function businessName(location: Record<string, unknown>) {
  return clean(location.name) || clean(location.restaurant_name) || clean(location.activity_name) || "Your business";
}

function publicProfileUrl(location: Record<string, unknown>) {
  const type = clean(location.location_type).toLowerCase().includes("activ") ? "activity" : "restaurant";
  return `https://www.theouthaven.com/locations/${type}/${encodeURIComponent(String(location.id))}`;
}

function photoSetupUrl() {
  return "https://www.theouthaven.com/locations/dashboard/profile?setup=photos";
}

function isPhotoReminder(type: MessageType) {
  return type === "photo_reminder_day3" || type === "photo_reminder_day7";
}

function recommendedAngle(location: Record<string, unknown>, metadata: Record<string, unknown> | null) {
  const stored = clean(metadata?.recommended_angle);
  if (stored) return stored;
  const hasExternalReservation = Boolean(
    clean(location.reservation_url) || clean(location.external_reservation_url) || clean(location.booking_url) ||
    clean(location.reservation_link) || clean(location.reservation_platform_url)
  );
  if (hasExternalReservation && location.uses_internal_reservations !== true) return "reservations";
  if (clean(location.location_type).toLowerCase().includes("activ")) return "events_experiences";
  return "growth_tools";
}

function upgradeCopy(angle: string) {
  if (angle === "reservations") {
    return {
      heading: "Your profile is complete. Ready to own more of the guest journey?",
      body: "Your TheOutHaven profile is now 100% complete. The next step is turning discovery into direct guest action. TheOutHaven Essentials can add reservation tools, events and experiences, website management, marketing, and business insights from the same location dashboard.",
      sms: "Your TheOutHaven profile is 100% complete. Want to turn more discovery into bookings? Explore Reservations + Essentials in your dashboard: https://www.theouthaven.com/locations/dashboard",
    };
  }
  if (angle === "events_experiences") {
    return {
      heading: "Your profile is complete. Now turn it into more guest activity.",
      body: "Your TheOutHaven profile is now 100% complete. TheOutHaven Essentials can help you publish events and experiences, manage reservations, build your website, market your location, and understand guest activity from one dashboard.",
      sms: "Your TheOutHaven profile is 100% complete. Ready to publish events/experiences and unlock more tools? Explore Essentials: https://www.theouthaven.com/locations/dashboard",
    };
  }
  return {
    heading: "Your profile is complete. There is more you can do with TheOutHaven.",
    body: "Your TheOutHaven profile is now 100% complete. TheOutHaven Essentials adds tools for reservations, events and experiences, website management, marketing, and business insights while keeping everything connected to your location profile.",
    sms: "Your TheOutHaven profile is 100% complete. Explore reservations, events, website, marketing and analytics tools in Essentials: https://www.theouthaven.com/locations/dashboard",
  };
}

function photoReminderCopy(name: string, type: MessageType, ownerPhotoCount: number) {
  const remainingToMinimum = Math.max(0, 3 - ownerPhotoCount);
  if (type === "photo_reminder_day7") {
    return {
      subject: `${name}: make your TheOutHaven profile yours`,
      heading: "Add your own photos when you are ready",
      body: `Your profile is live and can use available public imagery in the meantime. Adding ${remainingToMinimum || "a few"} more of your own photos gives you more control over what guests see first. Three photos is our recommended minimum and five completes the gallery.`,
      sms: `${name}: your profile is live. Add your own photos when you're ready so your images appear first: ${photoSetupUrl()}`,
    };
  }
  return {
    subject: `${name}: add your photos to your TheOutHaven profile`,
    heading: "Show guests what to expect",
    body: `Your claimed profile is live. Add ${remainingToMinimum || "a few"} more business photos to make it yours. Your uploads appear before third-party imagery. Three photos is the recommended minimum and five completes the gallery.`,
    sms: `${name}: add your own photos so they appear first on your TheOutHaven profile. 3 recommended, 5 completes the gallery: ${photoSetupUrl()}`,
  };
}

async function marketingAllowed(channel: "email" | "sms", contact: string) {
  const normalized = contact.trim();
  const contactQuery = channel === "email"
    ? supabaseAdmin.from("crm_contacts").select("id,do_not_contact,email_consent_status,sms_consent_status").ilike("email", normalized).is("archived_at", null).limit(1).maybeSingle()
    : supabaseAdmin.from("crm_contacts").select("id,do_not_contact,email_consent_status,sms_consent_status").or(`phone_e164.eq.${normalized},phone.eq.${normalized}`).is("archived_at", null).limit(1).maybeSingle();
  const { data: crmContact } = await contactQuery;
  if (!crmContact?.id || crmContact.do_not_contact) return false;

  const { data: preference } = await supabaseAdmin
    .from("crm_contact_preferences")
    .select("status")
    .eq("contact_id", crmContact.id)
    .eq("channel", channel)
    .in("communication_type", ["marketing", "sales"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (channel === "sms") return preference?.status === "granted";
  return preference?.status === "granted" || preference?.status === "not_required";
}

async function finish(id: string, status: string, values: Record<string, unknown> = {}) {
  await supabaseAdmin.from("profile_completion_nurture_queue").update({
    status,
    updated_at: new Date().toISOString(),
    ...values,
  }).eq("id", id);
}

export async function GET(request: Request) {
  if (!isCronRequestAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("profile_completion_nurture_queue")
    .select("id,location_id,claim_request_id,message_type,contact_channel,contact,status,due_at,attempt_count,metadata")
    .in("status", ["pending", "needs_consent", "failed"])
    .lte("due_at", now)
    .lt("attempt_count", 3)
    .order("due_at", { ascending: true })
    .limit(50);

  if (error) {
    console.error("PROFILE_COMPLETION_NURTURE_QUEUE_ERROR", error);
    return NextResponse.json({ error: "Queue load failed" }, { status: 500 });
  }

  let sent = 0;
  let consentHeld = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of (data || []) as QueueRow[]) {
    const contact = clean(item.contact);
    const channel = item.contact_channel;
    if (!contact || !channel) {
      await finish(item.id, "skipped", { last_error: "No verified contact available" });
      skipped++;
      continue;
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,name,restaurant_name,activity_name,location_type,reservation_url,external_reservation_url,booking_url,reservation_link,reservation_platform_url,uses_internal_reservations,subscription_status,plan_status,partner_activated_at,do_not_contact,do_not_contact_channel,owner_photo_count,photo_nudges_completed")
      .eq("id", item.location_id)
      .maybeSingle();

    if (locationError || !location) {
      await finish(item.id, "failed", { attempt_count: item.attempt_count + 1, last_error: "Location not found" });
      failed++;
      continue;
    }

    if (location.do_not_contact && (!location.do_not_contact_channel || location.do_not_contact_channel === channel)) {
      await finish(item.id, "skipped", { last_error: "Location is marked do not contact" });
      skipped++;
      continue;
    }

    const ownerPhotoCount = Number(location.owner_photo_count || 0);
    if (isPhotoReminder(item.message_type) && (ownerPhotoCount >= 3 || location.photo_nudges_completed === true)) {
      await finish(item.id, "skipped", { last_error: "Owner reached recommended photo minimum" });
      skipped++;
      continue;
    }

    if (item.message_type === "upgrade_intro") {
      const alreadyPaid = Boolean(location.partner_activated_at) || ["active", "trialing"].includes(clean(location.subscription_status).toLowerCase()) || ["active", "trialing"].includes(clean(location.plan_status).toLowerCase());
      if (alreadyPaid) {
        await finish(item.id, "skipped", { last_error: "Location already has an active paid relationship" });
        skipped++;
        continue;
      }
      const allowed = await marketingAllowed(channel, contact);
      if (!allowed) {
        await finish(item.id, "needs_consent", { last_error: "Sales/marketing consent not available for this channel" });
        consentHeld++;
        continue;
      }
    }

    await finish(item.id, "processing", { attempt_count: item.attempt_count + 1, last_error: null });

    const name = businessName(location as Record<string, unknown>);
    const angle = recommendedAngle(location as Record<string, unknown>, item.metadata);
    try {
      if (item.message_type === "completion_confirmation") {
        if (channel === "email") {
          const result = await sendRawBrandedEmail({
            to: contact,
            department: "account",
            subject: `${name}: your TheOutHaven profile is 100% complete`,
            heading: "Your business profile is complete",
            body: `Your ${name} profile has reached 100% profile strength. You are now in control of the core information guests see when TheOutHaven recommends your business.`,
            cta: { label: "View your public profile", url: publicProfileUrl(location as Record<string, unknown>) },
          });
          if (result.status === "error") throw new Error(result.error || "Email send failed");
        } else {
          await sendSms({
            to: contact,
            body: `${name}: your TheOutHaven profile is now 100% complete. View/manage your profile: https://www.theouthaven.com/locations/dashboard`,
          });
        }
      } else if (isPhotoReminder(item.message_type)) {
        const copy = photoReminderCopy(name, item.message_type, ownerPhotoCount);
        if (channel === "email") {
          const result = await sendRawBrandedEmail({
            to: contact,
            department: "account",
            subject: copy.subject,
            heading: copy.heading,
            body: copy.body,
            cta: { label: "Add your photos", url: photoSetupUrl() },
          });
          if (result.status === "error") throw new Error(result.error || "Email send failed");
        } else {
          await sendSms({ to: contact, body: copy.sms });
        }
      } else {
        const copy = upgradeCopy(angle);
        if (channel === "email") {
          const result = await sendRawBrandedEmail({
            to: contact,
            department: "account",
            subject: `${name}: your profile is complete - see what you can do next`,
            heading: copy.heading,
            body: copy.body,
            cta: { label: "Explore your business tools", url: "https://www.theouthaven.com/locations/dashboard" },
          });
          if (result.status === "error") throw new Error(result.error || "Email send failed");
        } else {
          await sendSms({ to: contact, body: copy.sms });
        }
      }

      const sentAt = new Date().toISOString();
      await finish(item.id, "sent", { sent_at: sentAt, last_error: null });

      if (isPhotoReminder(item.message_type)) {
        await supabaseAdmin
          .from("locations")
          .update({
            photo_nudge_count: Math.min(2, Number(location.photo_nudge_count || 0) + 1),
            last_photo_nudge_at: sentAt,
          })
          .eq("id", item.location_id);
      }

      const eventType = item.message_type === "completion_confirmation"
        ? "profile_completion_confirmation_sent"
        : item.message_type === "upgrade_intro"
          ? "upgrade_intro_sent"
          : item.message_type;
      await supabaseAdmin.from("claim_funnel_events").insert({
        location_id: item.location_id,
        event_type: eventType,
        metadata: {
          channel,
          recommended_angle: angle,
          nurture_queue_id: item.id,
          owner_photo_count: ownerPhotoCount,
        },
      });
      sent++;
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : "Send failed";
      await finish(item.id, "failed", { last_error: message });
      failed++;
    }
  }

  console.info("PROFILE_COMPLETION_NURTURE", {
    scanned: data?.length || 0,
    sent,
    consent_held: consentHeld,
    skipped,
    failed,
    duration_ms: Date.now() - started,
  });

  return NextResponse.json({
    ok: true,
    scanned: data?.length || 0,
    sent,
    consentHeld,
    skipped,
    failed,
    durationMs: Date.now() - started,
  });
}
