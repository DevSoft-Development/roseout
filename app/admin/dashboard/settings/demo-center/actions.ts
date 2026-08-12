"use server";

import { revalidatePath } from "next/cache";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  createOrRefreshMirrorDemoLocation,
  getMirrorDemoLocation,
  MIRROR_DEMO_KEY,
  resetMirrorDemoData,
  seedDemoReservations,
  runDemoEmailTest,
  demoMetadata,
  insertSafe,
  tableExists,
} from "@/lib/demo/demo-center";

export type DemoActionState = {
  ok: boolean;
  message: string;
  detail?: string;
  locationId?: string | null;
};

async function admin() {
  return requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
}

function done(
  message: string,
  extra: Partial<DemoActionState> = {},
): DemoActionState {
  revalidatePath("/admin/dashboard/settings/demo-center");
  return { ok: true, message, ...extra };
}

function fail(message: string, detail?: string): DemoActionState {
  revalidatePath("/admin/dashboard/settings/demo-center");
  return { ok: false, message, detail };
}

function errText(error: any) {
  return String(error?.message || error?.details || error?.hint || error || "");
}

function getSafeDemoErrorMessage(error: any) {
  const msg = errText(error);
  if (
    /Missing required field: locations\.|Missing required value for: locations\.|Invalid value for: locations\.|Database schema cache needs refresh|Unknown Supabase insert error|missing table|missing column|null constraint|invalid enum\/status value|duplicate key|schema cache issue/i.test(
      msg,
    )
  )
    return `${msg}. Next step: apply the latest migration or update the demo insert payload to match your locations schema.`;
  if (
    /demo metadata migration|demo_key|is_demo|demo_mode|demo_reset_at|demo_visible_publicly|metadata/i.test(
      msg,
    ) && /does not exist|missing|Could not find/i.test(msg)
  )
    return "The demo metadata migration has not been applied yet. Apply the latest Supabase migration, then try again.";
  if (/column .* does not exist|Could not find the .* column/i.test(msg))
    return "One of the optional demo location fields does not exist in the database. The seed helper needs to use safe per-column updates.";
  if (/duplicate key|unique constraint|already exists/i.test(msg))
    return "A unique demo record already exists. Reset demo data, then refresh again.";
  if (/relation .* does not exist|table .* does not exist|Could not find the table/i.test(msg))
    return "An optional Demo Center table is not installed yet. The module was skipped.";
  if (
    /null value in column "?([a-zA-Z0-9_]+)"? of relation "?locations"? violates not-null constraint/i.test(
      msg,
    )
  ) {
    const col = msg.match(/null value in column "?([a-zA-Z0-9_]+)"?/i)?.[1];
    return `Missing required field: locations.${col || "unknown"}. Next step: apply the latest migration or update the demo insert payload to match your locations schema.`;
  }
  if (/invalid input value for enum|violates check constraint/i.test(msg))
    return "A demo status value is not supported by this database schema.";
  if (/template|email/i.test(msg))
    return "Demo email could not be sent because no reservation demo email template is registered yet.";
  if (/CRON_SECRET/i.test(msg))
    return "CRON_SECRET is required before Demo Center can invoke the production reservation maintenance functions.";
  return "Check Vercel or Supabase function logs for the full server error.";
}

async function safely(label: string, fn: () => Promise<DemoActionState>) {
  await admin();
  try {
    return await fn();
  } catch (error) {
    console.error(`Demo Center ${label} failed`, error);
    return fail(
      "We could not complete that Demo Center action.",
      getSafeDemoErrorMessage(error),
    );
  }
}

function formDataFrom(args: any[]) {
  return args.find((arg) => arg instanceof FormData) as FormData | undefined;
}

async function requireMirrorDemoLocation() {
  const location = await getMirrorDemoLocation();
  if (!location?.id) throw new Error("Create or refresh the demo location first.");
  if (
    location.demo_key !== MIRROR_DEMO_KEY ||
    location.is_demo !== true ||
    location.is_searchable === true ||
    location.is_hidden !== true
  ) {
    throw new Error("Demo fixture failed the hidden mirror safety check.");
  }
  return location;
}

async function invokeDemoReservationFunction(
  functionName:
    | "reservation-reminder-cron"
    | "reservation-status-cleanup"
    | "reservation-daily-digest",
  body: Record<string, unknown> = {},
) {
  const location = await requireMirrorDemoLocation();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) throw new Error("CRON_SECRET is not configured.");

  const { data, error } = await supabaseAdmin.functions.invoke(functionName, {
    headers: { "x-cron-secret": cronSecret },
    body: {
      ...body,
      demoOnly: true,
      demoLocationId: String(location.id),
    },
  });

  if (error) throw error;
  if (data?.success === false) {
    throw new Error(String(data?.error || `${functionName} returned failure.`));
  }

  return { location, data: data || {} };
}

async function ensureDueDemoReminder(locationId: string) {
  let { data: reservation } = await supabaseAdmin
    .from("location_reservations")
    .select("id,location_id,status")
    .eq("location_id", locationId)
    .in("status", ["pending", "confirmed", "arrived", "seated", "checked_in"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!reservation?.id) {
    await seedDemoReservations(locationId);
    const retry = await supabaseAdmin
      .from("location_reservations")
      .select("id,location_id,status")
      .eq("location_id", locationId)
      .in("status", ["pending", "confirmed", "arrived", "seated", "checked_in"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    reservation = retry.data;
  }

  if (!reservation?.id || String(reservation.location_id) !== locationId) {
    throw new Error("No active demo reservation is available for a reminder test.");
  }

  const { data: existing } = await supabaseAdmin
    .from("reservation_reminders")
    .select("id")
    .eq("reservation_id", reservation.id)
    .eq("reminder_type", "reminder_2h")
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("reservation_reminders")
      .update({
        location_id: locationId,
        status: "scheduled",
        scheduled_for: new Date(Date.now() - 60_000).toISOString(),
        sent_at: null,
        error_message: null,
      })
      .eq("id", existing.id)
      .eq("location_id", locationId);
    if (error) throw error;
    return;
  }

  const result = await insertSafe("reservation_reminders", {
    reservation_id: reservation.id,
    location_id: locationId,
    reminder_type: "reminder_2h",
    scheduled_for: new Date(Date.now() - 60_000).toISOString(),
    status: "scheduled",
  });
  if (!result.ok) throw new Error(result.reason || "Unable to create demo reminder.");
}

async function updateLocationReservation(
  args: any[],
  status: string,
  message: string,
) {
  return safely(`reservation ${status}`, async () => {
    const location = await requireMirrorDemoLocation();
    const fd = formDataFrom(args);
    const id = String(fd?.get("reservationId") || "");
    if (!id) return fail("Choose a demo reservation first.");

    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .select("id,location_id,status")
      .eq("id", id)
      .eq("location_id", location.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return fail("That reservation is not part of TheOutHaven Lounge demo data.");

    const updates: Record<string, unknown> = { status };
    const now = new Date().toISOString();
    if (status === "checked_in") updates.checked_in_at = now;
    if (status === "completed") updates.completed_at = now;
    if (status === "cancelled") updates.cancelled_at = now;

    let result = await supabaseAdmin
      .from("location_reservations")
      .update(updates)
      .eq("id", id)
      .eq("location_id", location.id)
      .select("id")
      .maybeSingle();

    if (result.error) {
      result = await supabaseAdmin
        .from("location_reservations")
        .update({ status })
        .eq("id", id)
        .eq("location_id", location.id)
        .select("id")
        .maybeSingle();
    }
    if (result.error || !result.data?.id) {
      throw result.error || new Error("Demo reservation update did not apply.");
    }

    return done(message);
  });
}

export async function createOrRefreshMirrorDemoAction() {
  await admin();
  try {
    const result = await createOrRefreshMirrorDemoLocation();
    revalidatePath("/admin/dashboard/settings/demo-center");
    return {
      ok: true,
      message: "Demo location created. Some modules may still need setup.",
      detail:
        Array.isArray((result as any)?.demoWarnings) &&
        (result as any).demoWarnings.length
          ? `Module warnings: ${(result as any).demoWarnings.slice(0, 3).join("; ")}`
          : undefined,
      locationId: result?.id || null,
    };
  } catch (error) {
    console.error("Demo Center create/refresh failed", error);
    return {
      ok: false,
      message: "We could not create the demo location.",
      detail: getSafeDemoErrorMessage(error),
    };
  }
}

export async function createDemoLocationOnlyAction() {
  await admin();
  try {
    const result = await createOrRefreshMirrorDemoLocation({ seedModules: false });
    revalidatePath("/admin/dashboard/settings/demo-center");
    return {
      ok: true,
      message: "Demo location created. Some modules may still need setup.",
      detail:
        Array.isArray((result as any)?.demoWarnings) &&
        (result as any).demoWarnings.length
          ? `Location field warnings: ${(result as any).demoWarnings.slice(0, 3).join("; ")}`
          : undefined,
      locationId: result?.id || null,
    };
  } catch (error) {
    console.error("Demo Center location-only create failed", error);
    return {
      ok: false,
      message: "We could not create the demo location.",
      detail: getSafeDemoErrorMessage(error),
    };
  }
}

export async function resetMirrorDemoAction() {
  return safely("reset", async () => {
    await resetMirrorDemoData();
    return done("Mirror demo data reset. Public search visibility was disabled.");
  });
}

export async function resetGrowthProDemoAction() {
  return resetMirrorDemoAction();
}

export async function resetReservationDemoAction() {
  return safely("reservation reset", async () => {
    const location = await requireMirrorDemoLocation();
    await resetMirrorDemoData(location.id);
    await seedDemoReservations(location.id);
    return done("Reservation demo data reset.");
  });
}

export async function createDemoReservationAction() {
  return safely("create reservation", async () => {
    const location = await requireMirrorDemoLocation();
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const result = await insertSafe("location_reservations", {
      location_id: location.id,
      location_type: "restaurant",
      customer_name: "Demo New Request",
      customer_email: "demo-customer@theouthaven.com",
      customer_phone: "212-555-0199",
      party_size: 4,
      reservation_date: tomorrow,
      reservation_time: "19:00:00",
      status: "pending",
      source: "demo_center",
    });
    return result.ok
      ? done("Demo reservation request created in the real reservation table.")
      : fail("Demo reservation could not be created.", result.reason);
  });
}

export async function createDemoWaitlistAction() {
  return safely("create waitlist", async () => {
    const location = await requireMirrorDemoLocation();
    if (!(await tableExists("reservation_waitlist")))
      return fail("Waitlist is not installed yet for this project.");
    const result = await insertSafe("reservation_waitlist", {
      location_id: location.id,
      customer_name: "Demo Waitlist Guest",
      customer_email: "demo-customer@theouthaven.com",
      customer_phone: "212-555-0199",
      party_size: 3,
      status: "waiting",
      source: "demo_center",
      is_demo: true,
      demo_key: MIRROR_DEMO_KEY,
      metadata: demoMetadata,
    });
    return result.ok
      ? done("Demo waitlist request created.")
      : fail("Waitlist is not installed yet for this project.", result.reason);
  });
}

export async function confirmDemoReservationAction(...args: any[]) {
  return updateLocationReservation(args, "confirmed", "Demo reservation confirmed.");
}

export async function modifyDemoReservationAction(...args: any[]) {
  return safely("reservation modified", async () => {
    const location = await requireMirrorDemoLocation();
    const fd = formDataFrom(args);
    const id = String(fd?.get("reservationId") || "");
    if (!id) return fail("Choose a demo reservation first.");
    const { data, error } = await supabaseAdmin
      .from("location_reservations")
      .select("id")
      .eq("id", id)
      .eq("location_id", location.id)
      .maybeSingle();
    if (error) throw error;
    if (!data?.id) return fail("That reservation is not part of TheOutHaven Lounge demo data.");
    return done("Open the real Reserve dashboard to modify date, time, party size, or seating for this demo reservation.");
  });
}

export async function cancelDemoReservationAction(...args: any[]) {
  return updateLocationReservation(args, "cancelled", "Demo reservation cancelled.");
}

export async function markDemoReservationCheckedInAction(...args: any[]) {
  return updateLocationReservation(args, "checked_in", "Demo reservation checked in.");
}

export async function markDemoReservationCompletedAction(...args: any[]) {
  const result = await updateLocationReservation(
    args,
    "completed",
    "Demo reservation completed and review eligibility created if supported.",
  );
  const fd = formDataFrom(args);
  const location = await requireMirrorDemoLocation();
  const id = String(fd?.get("reservationId") || "");
  if (result.ok && id)
    await insertSafe("outing_visit_verifications", {
      location_id: location.id,
      reservation_id: id,
      verification_type: "reservation_verified",
      verification_status: "verified",
      verification_source: "demo_center",
      metadata: demoMetadata,
    });
  return result;
}

export async function markDemoReservationNoShowAction(...args: any[]) {
  return updateLocationReservation(args, "no_show", "Demo reservation marked no-show.");
}

export async function sendDemoReservationReminderAction() {
  return safely("reminder", async () => {
    const location = await requireMirrorDemoLocation();
    await ensureDueDemoReminder(String(location.id));
    const result = await invokeDemoReservationFunction(
      "reservation-reminder-cron",
      { limit: 25 },
    );
    return done(
      `Demo reminder processor ran for TheOutHaven Lounge: ${Number(result.data.sent || 0)} sent, ${Number(result.data.skipped || 0)} skipped, ${Number(result.data.failed || 0)} failed.`,
    );
  });
}

export async function sendDemoReservationCustomerConfirmationAction() {
  return safely("customer confirmation", async () =>
    fail(
      "Use the real reservation booking flow to test customer confirmation.",
      "The production reservation API sends customer and owner notifications together when a real location reservation is created; Demo Center no longer reports a fake queued confirmation.",
    ),
  );
}

export async function sendDemoReservationOwnerNotificationAction() {
  return safely("owner notification", async () =>
    fail(
      "Use the real reservation booking flow to test owner notification.",
      "The production reservation API owns the combined customer/owner notification transaction; Demo Center no longer reports a fake queued owner notification.",
    ),
  );
}

export async function runDemoReservationDailyDigestAction() {
  return safely("digest", async () => {
    const result = await invokeDemoReservationFunction(
      "reservation-daily-digest",
      { sendEmail: true },
    );
    return done(
      `Demo reservation digest ran for TheOutHaven Lounge and ${result.data?.email?.sent ? "sent to demo-reservations@theouthaven.com" : "completed without a delivered email"}.`,
    );
  });
}

export async function runDemoReservationCleanupAction() {
  return safely("cleanup", async () => {
    const result = await invokeDemoReservationFunction(
      "reservation-status-cleanup",
      { dryRun: false, graceMinutes: 180 },
    );
    return done(
      `Demo cleanup ran only for TheOutHaven Lounge: ${Number(result.data.reservationsMarkedNoShow || 0)} no-show updates, ${Number(result.data.remindersCancelled || 0)} reminders cancelled, ${Number(result.data.expiredLocksDeleted || 0)} expired locks removed.`,
    );
  });
}

export async function createDemoReservationReviewEligibilityAction(...args: any[]) {
  return markDemoReservationCompletedAction(...args);
}

export async function createTeamTrainingSessionAction() {
  return safely("team training", async () =>
    done("Open Team Training to create isolated CRM practice sessions."),
  );
}

export async function resetTeamTrainingSessionAction() {
  return safely("team training reset", async () =>
    done("Use the existing Team Training reset controls for session copies."),
  );
}

export async function runDemoNotificationTestAction() {
  return safely("notification test", async () => {
    const location = await requireMirrorDemoLocation();
    await insertSafe("location_notification_events", {
      location_id: location.id,
      event_type: "demo_test",
      title: "Demo notification test",
      message: "Safe Demo Center notification test.",
      metadata: demoMetadata,
    });
    return done("Demo notification test created if notifications are installed.");
  });
}

export async function runDemoEmailTestAction() {
  const currentAdmin = await admin();
  try {
    const result: any = await runDemoEmailTest(currentAdmin.email);
    if (result?.ok === false) return fail(result.message);
    return done("Demo email test queued through the enterprise email system.");
  } catch (error) {
    console.error("Demo Center email test failed", error);
    return fail(
      "Demo email could not be sent because no reservation demo email template is registered yet.",
      getSafeDemoErrorMessage(error),
    );
  }
}

export async function toggleDemoDirectVisibilityAction() {
  return safely("visibility", async () => {
    const location = await requireMirrorDemoLocation();
    const { error } = await supabaseAdmin
      .from("locations")
      .update({
        demo_visible_publicly: !location.demo_visible_publicly,
        is_searchable: false,
      })
      .eq("id", location.id)
      .eq("demo_key", MIRROR_DEMO_KEY);
    if (error) throw error;
    return done("Direct demo visibility toggled. Public search remains disabled.");
  });
}

export async function toggleDemoPublicSearchVisibilityAction() {
  return safely("public search", async () =>
    done("Public search visibility remains disabled by design for demo safety."),
  );
}

export async function regenerateDemoQrCodesAction() {
  return safely("regenerate QR", async () => {
    await requireMirrorDemoLocation();
    await createOrRefreshMirrorDemoLocation();
    return done("Demo QR records regenerated.");
  });
}

export async function simulateDemoQrScanAction() {
  return safely("QR scan", async () => {
    const location = await requireMirrorDemoLocation();
    await insertSafe("location_qr_scan_events", {
      location_id: location.id,
      qr_type: "demo_simulated",
      metadata: demoMetadata,
    });
    return done("Demo QR scan simulated if QR analytics are installed.");
  });
}
