import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { discoverReservation, reservationRecoveryPriority } from "../_shared/reservation-discovery.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});

const ALLOWED_STATUSES = new Set(["", "not_found", "failed", "blocked", "no_website"]);

function blank(value: unknown) {
  return value == null || (typeof value === "string" && !value.trim());
}

serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) return json({ error: "Missing required environment" }, 500);

  const supabase = createClient(supabaseUrl, serviceKey);
  const cronSecret = Deno.env.get("CRON_SECRET") || Deno.env.get("UNIFIED_LOCATION_GAP_REPAIR_SECRET");
  const cronAuthorized = Boolean(cronSecret && req.headers.get("x-cron-secret") === cronSecret);
  const runId = String(req.headers.get("x-recovery-run-id") || "").trim();
  let runAuthorized = false;

  if (!cronAuthorized && runId) {
    const { data: run } = await supabase
      .from("cron_job_runs")
      .select("id,status,job_key,source,created_at")
      .eq("id", runId)
      .eq("job_key", "reservation-recovery-manual")
      .eq("source", "manual_capability")
      .eq("status", "started")
      .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .maybeSingle();

    if (run) {
      const { data: consumed } = await supabase
        .from("cron_job_runs")
        .update({ status: "running", started_at: new Date().toISOString(), message: "Reservation recovery run started." })
        .eq("id", runId)
        .eq("status", "started")
        .select("id")
        .maybeSingle();
      runAuthorized = Boolean(consumed?.id);
    }
  }

  if (!cronAuthorized && !runAuthorized) return json({ error: "Unauthorized" }, 401);

  const body = await req.json().catch(() => ({}));
  const limit = Math.min(50, Math.max(1, Number(body.limit || 50)));
  const concurrency = Math.min(8, Math.max(1, Number(body.concurrency || 8)));
  const force = body.force === true;
  const requestedStatuses = Array.isArray(body.statuses)
    ? body.statuses.map((value: unknown) => String(value || "").trim()).filter((value: string) => ALLOWED_STATUSES.has(value))
    : [];
  const statusFilter = requestedStatuses.length ? new Set(requestedStatuses) : null;
  const now = new Date();

  const { data, error } = await supabase
    .from("locations")
    .select("id,name,website,location_type,reservation_discovery_status,reservation_discovery_next_retry_at,external_reservation_url,reservation_external_url,reservation_provider_url,reservation_platform_url,reservation_url,reservation_link,booking_url,is_demo,is_hidden,duplicate_status,deleted_at")
    .is("deleted_at", null)
    .not("website", "is", null)
    .order("reservation_discovery_next_retry_at", { ascending: true, nullsFirst: true })
    .limit(Math.max(limit * 120, 6_000));

  if (error) return json({ error: error.message }, 500);

  const candidates = (data || [])
    .filter((row: any) => {
      if (row.is_demo === true || row.is_hidden === true) return false;
      if (String(row.duplicate_status || "").toLowerCase() === "duplicate") return false;
      const alreadyHasReservation = [
        row.external_reservation_url,
        row.reservation_external_url,
        row.reservation_provider_url,
        row.reservation_platform_url,
        row.reservation_url,
        row.reservation_link,
        row.booking_url,
      ].some((value) => !blank(value));
      if (alreadyHasReservation || blank(row.website)) return false;
      const status = String(row.reservation_discovery_status || "");
      if (!ALLOWED_STATUSES.has(status)) return false;
      if (statusFilter && !statusFilter.has(status)) return false;
      if (force) return true;
      if (!row.reservation_discovery_next_retry_at) return true;
      return new Date(row.reservation_discovery_next_retry_at).getTime() <= now.getTime();
    })
    .sort((a: any, b: any) => reservationRecoveryPriority(a) - reservationRecoveryPriority(b))
    .slice(0, limit);

  const counters = {
    selected: candidates.length,
    attempted: 0,
    found: 0,
    notFound: 0,
    blocked: 0,
    failed: 0,
    googleCalls: 0,
    requestedStatuses,
    providerCounts: {} as Record<string, number>,
  };

  const processRow = async (row: any) => {
    const checkedAt = new Date().toISOString();
    try {
      counters.attempted += 1;
      const discovery = await discoverReservation(String(row.website));
      const update: Record<string, unknown> = {
        reservation_discovery_status: discovery.status,
        reservation_discovery_source: "reservation_only_website_crawl",
        reservation_discovery_notes: discovery.note,
        reservation_discovery_checked_at: checkedAt,
        reservation_last_checked_at: checkedAt,
      };

      if (discovery.match) {
        const match = discovery.match;
        update.external_reservation_url = match.url;
        update.reservation_external_url = match.url;
        update.reservation_url = match.url;
        update.reservation_link = match.url;
        update.reservation_provider_url = match.url;
        update.reservation_platform_url = match.url;
        update.reservation_provider = match.provider;
        update.reservation_provider_name = match.provider;
        update.reservation_platform = match.provider;
        update.reservation_provider_status = "discovered";
        update.reservation_source = "external";
        update.reservation_source_url = row.website;
        counters.found += 1;
        counters.providerCounts[match.provider] = (counters.providerCounts[match.provider] || 0) + 1;
      } else if (discovery.status === "not_found") counters.notFound += 1;
      else if (discovery.status === "blocked") counters.blocked += 1;
      else counters.failed += 1;

      const { error: updateError } = await supabase.from("locations").update(update).eq("id", row.id);
      if (updateError) throw updateError;
    } catch (err) {
      counters.failed += 1;
      await supabase.from("locations").update({
        reservation_discovery_status: "failed",
        reservation_discovery_source: "reservation_only_website_crawl",
        reservation_discovery_notes: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
        reservation_discovery_checked_at: checkedAt,
        reservation_last_checked_at: checkedAt,
      }).eq("id", row.id);
    }
  };

  for (let index = 0; index < candidates.length; index += concurrency) {
    await Promise.all(candidates.slice(index, index + concurrency).map(processRow));
  }

  if (runAuthorized && runId) {
    const finishedAt = new Date().toISOString();
    await supabase.from("cron_job_runs").update({
      status: "success",
      finished_at: finishedAt,
      completed_at: finishedAt,
      checked_count: counters.attempted,
      success_count: counters.found,
      failed_count: counters.failed,
      message: `Reservation recovery completed: ${counters.found} found of ${counters.attempted}.`,
      metadata: { mode: "reservation_only", googleCalls: 0, requestedStatuses, providerCounts: counters.providerCounts },
    }).eq("id", runId);
  }

  return json({ success: true, mode: "reservation_only", force, concurrency, ...counters });
});
