import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { sendEmail } from "../_shared/email.ts";
import { sendSms } from "../_shared/sms.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";
import { resolveDemoReservationScope } from "../_shared/demoReservationScope.ts";
import {
  escapeHtml,
  formatDate,
  formatTime,
  inactiveStatuses,
  returnIfDisabled,
  successRate,
} from "../_shared/reservationCron.ts";

const JOB = "reservation-reminder-cron";

function reminderHtml(reservation: any, locationName: string) {
  const name = reservation.customer_name || reservation.guest_name || "there";
  const manage = reservation.customer_token
    ? `${Deno.env.get("SITE_URL") || Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://theouthaven.com"}/reserve/confirmation/${reservation.customer_token}`
    : null;

  return `<div style="font-family:Arial,sans-serif;background:#fff;color:#18181b;padding:24px;line-height:1.6"><div style="color:#be123c;font-weight:900;letter-spacing:.08em;text-transform:uppercase">TheOutHaven Reserve</div><h1 style="margin:8px 0 12px">Your reservation is coming up</h1><p>Hi ${escapeHtml(name)}, this is a friendly reminder for your reservation at <b>${escapeHtml(locationName)}</b>.</p><div style="border:1px solid #f3d5a5;border-radius:16px;padding:16px;background:#fffaf2"><p><b>Date:</b> ${escapeHtml(formatDate(reservation.reservation_date))}</p><p><b>Time:</b> ${escapeHtml(formatTime(reservation.reservation_time))}</p><p><b>Party size:</b> ${escapeHtml(reservation.party_size || "—")}</p>${reservation.confirmation_code ? `<p><b>Confirmation:</b> ${escapeHtml(reservation.confirmation_code)}</p>` : ""}</div>${manage ? `<p><a href="${escapeHtml(manage)}" style="display:inline-block;background:#be123c;color:white;border-radius:999px;padding:12px 18px;text-decoration:none;font-weight:800">Manage reservation</a></p>` : `<p>If you need to cancel or modify, please contact TheOutHaven support or the location directly.</p>`}</div>`;
}

function reminderText(reservation: any, locationName: string) {
  return `Reminder: ${locationName} on ${formatDate(reservation.reservation_date)} at ${formatTime(reservation.reservation_time)} for ${reservation.party_size || "your party"}.`;
}

function reminderSmsText(reservation: any, locationName: string) {
  const manage = reservation.customer_token
    ? ` Manage: ${Deno.env.get("SITE_URL") || Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://theouthaven.com"}/reserve/confirmation/${reservation.customer_token}`
    : "";
  return `Reminder: your reservation at ${locationName} is coming up on ${formatDate(reservation.reservation_date)} at ${formatTime(reservation.reservation_time)}.${manage}`;
}

function channelError(label: string, result: any) {
  if (!result || result.sent || result.skipped) return null;
  return `${label}: ${String(result.error || result.reason || "delivery_failed").slice(0, 160)}`;
}

async function logReminderDelivery(
  supabase: any,
  reminder: any,
  reservation: any,
  metadata: any,
  partialFailure: boolean,
) {
  await supabase.from("reservation_activity_logs").insert({
    location_id: reservation.location_id || reminder.location_id || null,
    reservation_id: reservation.id || reminder.reservation_id || null,
    actor_id: null,
    action: "reservation_reminder_delivery",
    details: {
      reminder_id: reminder.id,
      reminder_type: reminder.reminder_type,
      email: metadata.email,
      sms: metadata.sms,
      partial_failure: partialFailure,
      attempted_at: new Date().toISOString(),
    },
  });
}

Deno.serve(async (req) => {
  const opt = handleOptions(req);
  if (opt) return opt;

  const timer = startTimer();
  const startedAt = new Date().toISOString();
  const supabase = createSupabaseAdminClient();

  try {
    const auth = await requireAdminOrCron(req, supabase);
    const disabled = await returnIfDisabled(supabase, JOB, startedAt, timer);
    if (disabled) return disabled;

    const body = await req.json().catch(() => ({}));
    const demoLocationId = await resolveDemoReservationScope(supabase, body);
    const limit = Math.min(Math.max(Number(body.limit ?? 100), 1), 250);
    const now = new Date().toISOString();

    let reminderQuery = supabase
      .from("reservation_reminders")
      .select("*")
      .eq("status", "scheduled")
      .lte("scheduled_for", now);

    if (demoLocationId) {
      reminderQuery = reminderQuery.eq("location_id", demoLocationId);
    }

    const { data: reminders, error } = await reminderQuery
      .order("scheduled_for", { ascending: true })
      .limit(limit);

    if (error) throw error;

    const rows = reminders || [];
    const results: any[] = [];
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    let partialFailures = 0;

    for (const reminder of rows) {
      try {
        if (demoLocationId && String(reminder.location_id || "") !== demoLocationId) {
          throw new Error("FORBIDDEN: reminder escaped demo location scope");
        }

        const { data: reservation, error: reservationError } = await supabase
          .from("location_reservations")
          .select("*")
          .eq("id", reminder.reservation_id)
          .maybeSingle();

        if (reservationError || !reservation) {
          throw new Error(reservationError?.message || "reservation_not_found");
        }

        if (demoLocationId && String(reservation.location_id || "") !== demoLocationId) {
          throw new Error("FORBIDDEN: reservation escaped demo location scope");
        }

        const status = String(reservation.status || "").toLowerCase();
        if (inactiveStatuses.has(status)) {
          await supabase
            .from("reservation_reminders")
            .update({ status: "cancelled", error_message: null })
            .eq("id", reminder.id)
            .eq("location_id", reminder.location_id);
          skipped++;
          results.push({
            id: reminder.id,
            reservation_id: reminder.reservation_id,
            status: "skipped",
            reason: `reservation_${status}`,
          });
          continue;
        }

        let locationName =
          reservation.location_name ||
          reservation.restaurant_name ||
          reservation.activity_name ||
          reservation.business_name ||
          "TheOutHaven location";

        let reminderSettings: any = {
          guest24h: true,
          guest2h: true,
          email: true,
          sms: false,
        };

        if (reservation.location_id) {
          const { data: loc } = await supabase
            .from("locations")
            .select("name,restaurant_name,activity_name,business_name,reservation_settings")
            .eq("id", reservation.location_id)
            .maybeSingle();

          locationName =
            loc?.name ||
            loc?.restaurant_name ||
            loc?.activity_name ||
            loc?.business_name ||
            locationName;

          reminderSettings = {
            ...reminderSettings,
            ...(loc?.reservation_settings?.reminders || {}),
          };
        }

        const type = String(reminder.reminder_type || "");
        if (
          (type.includes("24") && reminderSettings.guest24h === false) ||
          (type.includes("2") && reminderSettings.guest2h === false)
        ) {
          await supabase
            .from("reservation_reminders")
            .update({
              status: "cancelled",
              error_message: "This reminder type is off for this location.",
            })
            .eq("id", reminder.id)
            .eq("location_id", reminder.location_id);
          skipped++;
          results.push({
            id: reminder.id,
            reservation_id: reminder.reservation_id,
            status: "skipped",
            reason: "reminder_type_disabled",
          });
          continue;
        }

        const emailEnabled = reminderSettings.email !== false;
        const smsEnabled = reminderSettings.sms === true;

        if (!emailEnabled && !smsEnabled) {
          await supabase
            .from("reservation_reminders")
            .update({
              status: "cancelled",
              error_message: "All reminder channels are off for this location.",
            })
            .eq("id", reminder.id)
            .eq("location_id", reminder.location_id);
          skipped++;
          results.push({
            id: reminder.id,
            reservation_id: reminder.reservation_id,
            status: "skipped",
            reason: "all_channels_disabled",
          });
          continue;
        }

        const email =
          reservation.customer_email || reservation.guest_email || reservation.email;
        const phone =
          reservation.customer_phone || reservation.guest_phone || reservation.phone;
        const isTomorrow =
          reminder.reminder_type === "24h" ||
          String(reminder.reminder_type || "").includes("day");

        const metadata: any = {
          email: emailEnabled
            ? email
              ? await sendEmail({
                  to: email,
                  subject: isTomorrow
                    ? "Reminder: your TheOutHaven reservation is tomorrow"
                    : "Reminder: your TheOutHaven reservation is coming up",
                  html: reminderHtml(reservation, locationName),
                  text: reminderText(reservation, locationName),
                  senderKey: "reservations",
                })
              : { sent: false, skipped: true, reason: "missing_customer_email" }
            : { sent: false, skipped: true, reason: "email_disabled" },
          sms: smsEnabled
            ? await sendSms({
                to: phone,
                body: reminderSmsText(reservation, locationName),
              })
            : { sent: false, skipped: true, reason: "sms_disabled" },
        };

        const emailDelivered = Boolean(metadata.email?.sent);
        const smsDelivered = Boolean(metadata.sms?.sent);
        const delivered = emailDelivered || smsDelivered;
        const deliveryErrors = [
          emailEnabled ? channelError("email", metadata.email) : null,
          smsEnabled ? channelError("sms", metadata.sms) : null,
        ].filter(Boolean) as string[];
        const partialFailure = delivered && deliveryErrors.length > 0;

        await logReminderDelivery(
          supabase,
          reminder,
          reservation,
          metadata,
          partialFailure,
        );

        if (delivered) {
          await supabase
            .from("reservation_reminders")
            .update({
              status: "sent",
              sent_at: new Date().toISOString(),
              error_message: partialFailure ? deliveryErrors.join(" | ").slice(0, 240) : null,
            })
            .eq("id", reminder.id)
            .eq("location_id", reminder.location_id);
          sent++;
          if (partialFailure) partialFailures++;
          results.push({
            id: reminder.id,
            reservation_id: reminder.reservation_id,
            status: "sent",
            partial_failure: partialFailure,
            metadata,
          });
          continue;
        }

        const enabledChannelResults = [
          emailEnabled ? metadata.email : null,
          smsEnabled ? metadata.sms : null,
        ].filter(Boolean);
        const reason =
          deliveryErrors.join(" | ") ||
          enabledChannelResults
            .map((result: any) => result?.reason)
            .filter(Boolean)
            .join(" | ") ||
          "reminder_delivery_failed";

        await supabase
          .from("reservation_reminders")
          .update({ status: "failed", error_message: String(reason).slice(0, 240) })
          .eq("id", reminder.id)
          .eq("location_id", reminder.location_id);
        failed++;
        results.push({
          id: reminder.id,
          reservation_id: reminder.reservation_id,
          status: "failed",
          error: String(reason).slice(0, 240),
          metadata,
        });
      } catch (err) {
        const msg = safeError(err).slice(0, 240);
        await supabase
          .from("reservation_reminders")
          .update({ status: "failed", error_message: msg })
          .eq("id", reminder.id)
          .eq("location_id", reminder.location_id);
        failed++;
        results.push({
          id: reminder.id,
          reservation_id: reminder.reservation_id,
          status: "failed",
          error: msg,
        });
      }
    }

    const status = failed
      ? sent || skipped
        ? "warning"
        : "failed"
      : partialFailures
        ? "warning"
        : "success";

    await logCronJobRun(supabase, {
      job_name: JOB,
      job_key: JOB,
      function_name: JOB,
      route_path: `supabase/functions/${JOB}`,
      description: "Production reservation reminder processor.",
      schedule_hint: "pg_cron: */15 * * * *",
      source: "edge_function",
      status,
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      checked_count: rows.length,
      success_count: sent,
      skipped_count: skipped,
      failed_count: failed,
      success_rate: successRate(sent, failed, skipped),
      metadata: {
        authSource: auth.source,
        partial_failure_count: partialFailures,
        demo_location_id: demoLocationId,
      },
    });

    await logEdgeFunctionRun(supabase, {
      function_name: JOB,
      status: status === "failed" ? "error" : "success",
      source: auth.source,
      duration_ms: timer(),
      output_summary: {
        checked: rows.length,
        sent,
        skipped,
        failed,
        partial_failures: partialFailures,
        demo_location_id: demoLocationId,
      },
    });

    return ok({
      success: true,
      demoLocationId,
      checked: rows.length,
      sent,
      skipped,
      failed,
      partial_failures: partialFailures,
      results,
    });
  } catch (error) {
    const message = safeError(error);
    await logCronJobRun(supabase, {
      job_name: JOB,
      job_key: JOB,
      function_name: JOB,
      route_path: `supabase/functions/${JOB}`,
      source: "edge_function",
      status: "failed",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      failed_count: 1,
      error_message: message,
    });
    return serverError(`${JOB} failed`, message);
  }
});
