import { handleOptions } from "../_shared/cors.ts";
import { ok, serverError } from "../_shared/response.ts";
import { requireAdminOrCron } from "../_shared/auth.ts";
import { createSupabaseAdminClient } from "../_shared/supabaseAdmin.ts";
import { logCronJobRun } from "../_shared/cronLogger.ts";
import { logEdgeFunctionRun, safeError, startTimer } from "../_shared/logger.ts";
import { resolveDemoReservationScope } from "../_shared/demoReservationScope.ts";
import { returnIfDisabled, successRate } from "../_shared/reservationCron.ts";
import { reservationNewYorkInstant } from "../_shared/reservationTime.ts";

const JOB = "reservation-status-cleanup";

function endedBefore(row: any, cutoff: Date) {
  const dt = reservationNewYorkInstant(
    row.reservation_date,
    row.reservation_time || "23:59:00",
  );
  return !Number.isNaN(dt.getTime()) && dt < cutoff;
}

async function tableExists(supabase: any, table: string) {
  const { error } = await supabase.from(table).select("*").limit(1);
  return !error || !["42P01", "PGRST205"].includes(error.code);
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
    const dryRun = body.dryRun === true;
    const graceMinutes = Math.min(
      Math.max(Number(body.graceMinutes ?? 180), 15),
      10080,
    );
    const cutoff = new Date(Date.now() - graceMinutes * 60000);

    let checked = 0;
    let reservationsMarkedNoShow = 0;
    let remindersCancelled = 0;
    let expiredLocksDeleted = 0;
    let skipped = 0;
    let failed = 0;

    let candidateQuery = supabase
      .from("location_reservations")
      .select("*")
      .in("status", ["pending", "confirmed"])
      .lte("reservation_date", cutoff.toISOString().slice(0, 10));
    if (demoLocationId) {
      candidateQuery = candidateQuery.eq("location_id", demoLocationId);
    }

    const { data: candidates, error } = await candidateQuery.limit(500);
    if (error) throw error;

    const stale = (candidates || []).filter((row: any) => endedBefore(row, cutoff));
    checked = stale.length;

    if (!dryRun && stale.length) {
      for (const row of stale) {
        if (demoLocationId && String(row.location_id || "") !== demoLocationId) {
          throw new Error("FORBIDDEN: reservation escaped demo cleanup scope");
        }

        let update: any = {
          status: "no_show",
          no_show_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        let updateQuery = supabase
          .from("location_reservations")
          .update(update)
          .eq("id", row.id);
        if (demoLocationId) updateQuery = updateQuery.eq("location_id", demoLocationId);
        let { error: updateError } = await updateQuery;

        if (updateError) {
          update = { status: "no_show", updated_at: new Date().toISOString() };
          let retryQuery = supabase
            .from("location_reservations")
            .update(update)
            .eq("id", row.id);
          if (demoLocationId) retryQuery = retryQuery.eq("location_id", demoLocationId);
          ({ error: updateError } = await retryQuery);
        }
        if (updateError) {
          let fallbackQuery = supabase
            .from("location_reservations")
            .update({ status: "no_show" })
            .eq("id", row.id);
          if (demoLocationId) fallbackQuery = fallbackQuery.eq("location_id", demoLocationId);
          ({ error: updateError } = await fallbackQuery);
        }
        if (updateError) failed++;
        else reservationsMarkedNoShow++;
      }
    } else {
      reservationsMarkedNoShow = dryRun ? stale.length : 0;
    }

    let deadQuery = supabase
      .from("location_reservations")
      .select("id,location_id")
      .in("status", ["cancelled", "completed", "no_show", "declined"]);
    if (demoLocationId) {
      deadQuery = deadQuery.eq("location_id", demoLocationId);
    }

    const { data: deadReservations } = await deadQuery.limit(1000);
    const ids = (deadReservations || []).map((row: any) => row.id);

    if (ids.length) {
      if (dryRun) {
        let reminderCountQuery = supabase
          .from("reservation_reminders")
          .select("id", { count: "exact", head: true })
          .eq("status", "scheduled")
          .in("reservation_id", ids);
        if (demoLocationId) {
          reminderCountQuery = reminderCountQuery.eq("location_id", demoLocationId);
        }
        const { count } = await reminderCountQuery;
        remindersCancelled = count || 0;
      } else {
        let reminderUpdate = supabase
          .from("reservation_reminders")
          .update({ status: "cancelled", error_message: null })
          .eq("status", "scheduled")
          .in("reservation_id", ids);
        if (demoLocationId) {
          reminderUpdate = reminderUpdate.eq("location_id", demoLocationId);
        }
        const { data, error: remErr } = await reminderUpdate.select("id");
        if (remErr) failed++;
        else remindersCancelled = data?.length || 0;
      }
    }

    if (await tableExists(supabase, "reservation_slot_locks")) {
      let lockQuery = supabase
        .from("reservation_slot_locks")
        .select("id", { count: "exact", head: true })
        .lt("expires_at", new Date().toISOString());
      if (demoLocationId) {
        lockQuery = lockQuery.eq("location_id", demoLocationId);
      }

      if (dryRun) {
        const { count } = await lockQuery;
        expiredLocksDeleted = count || 0;
      } else {
        let lockDelete = supabase
          .from("reservation_slot_locks")
          .delete()
          .lt("expires_at", new Date().toISOString());
        if (demoLocationId) {
          lockDelete = lockDelete.eq("location_id", demoLocationId);
        }
        const { data, error: lockErr } = await lockDelete.select("id");
        if (lockErr) skipped++;
        else expiredLocksDeleted = data?.length || 0;
      }
    } else {
      skipped++;
    }

    const successCount =
      reservationsMarkedNoShow + remindersCancelled + expiredLocksDeleted;

    await logCronJobRun(supabase, {
      job_name: JOB,
      job_key: JOB,
      function_name: JOB,
      route_path: `supabase/functions/${JOB}`,
      description: "Production reservation cleanup Edge Function.",
      schedule_hint: "pg_cron: 10 * * * *",
      source: "edge_function",
      status: failed ? "warning" : "success",
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      duration_ms: timer(),
      checked_count: checked,
      success_count: successCount,
      skipped_count: skipped,
      failed_count: failed,
      success_rate: successRate(successCount, failed, skipped),
      metadata: {
        dryRun,
        graceMinutes,
        authSource: auth.source,
        demo_location_id: demoLocationId,
      },
    });

    await logEdgeFunctionRun(supabase, {
      function_name: JOB,
      status: failed ? "error" : "success",
      source: auth.source,
      duration_ms: timer(),
      output_summary: {
        checked,
        reservationsMarkedNoShow,
        remindersCancelled,
        expiredLocksDeleted,
        demo_location_id: demoLocationId,
      },
    });

    return ok({
      success: true,
      demoLocationId,
      dryRun,
      checked,
      reservationsMarkedNoShow,
      remindersCancelled,
      expiredLocksDeleted,
      skipped,
      failed,
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
