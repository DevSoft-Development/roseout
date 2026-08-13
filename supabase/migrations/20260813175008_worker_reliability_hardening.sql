-- Worker reliability hardening:
-- 1. Close SECURITY DEFINER worker RPCs to public callers.
-- 2. Persist and reconcile pg_net HTTP outcomes instead of treating dispatch as success.
-- 3. Consolidate five every-minute worker pollers into one tracked dispatcher.
-- 4. Disable the unsafe outing reminder schedule until delivery is implemented.
-- 5. Provide a service-role-only seven-day soak report.

create extension if not exists pg_cron;
create extension if not exists pg_net;
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to postgres, service_role;

-- Every overload must be closed explicitly. Revoking from anon/authenticated alone
-- is insufficient because Postgres grants function execution to PUBLIC by default.
do $security$
declare
  worker_function regprocedure;
begin
  for worker_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'enqueue_worker_job',
        'claim_worker_jobs',
        'update_worker_job_progress',
        'heartbeat_worker_job',
        'complete_worker_job',
        'fail_worker_job',
        'cancel_worker_job',
        'retry_worker_job',
        'recover_stale_worker_jobs'
      ])
  loop
    execute format(
      'revoke all on function %s from public, anon, authenticated',
      worker_function
    );
    execute format(
      'grant execute on function %s to service_role',
      worker_function
    );
  end loop;
end
$security$;

alter table public.worker_jobs enable row level security;
alter table public.worker_job_events enable row level security;
alter table public.worker_job_checkpoints enable row level security;
revoke all on table public.worker_jobs from anon, authenticated;
revoke all on table public.worker_job_events from anon, authenticated;
revoke all on table public.worker_job_checkpoints from anon, authenticated;

alter table public.cron_job_runs
  add column if not exists request_id bigint,
  add column if not exists http_status integer,
  add column if not exists transport_status text,
  add column if not exists response_excerpt text,
  add column if not exists reconciled_at timestamptz;

create unique index if not exists cron_job_runs_request_id_idx
  on public.cron_job_runs(request_id)
  where request_id is not null;

create or replace function private.response_declares_failure(p_content text)
returns boolean
language plpgsql
immutable
set search_path = pg_catalog
as $function$
declare
  parsed jsonb;
begin
  if nullif(btrim(p_content), '') is null then
    return false;
  end if;

  begin
    parsed := p_content::jsonb;
  exception when others then
    return false;
  end;

  return lower(coalesce(parsed ->> 'success', 'true')) = 'false'
    or lower(coalesce(parsed ->> 'ok', 'true')) = 'false';
end
$function$;

create or replace function private.dispatch_tracked_edge_request(
  p_job_key text,
  p_function_name text,
  p_url text,
  p_headers jsonb default '{}'::jsonb,
  p_body jsonb default '{}'::jsonb,
  p_timeout_milliseconds integer default 55000
)
returns bigint
language plpgsql
security definer
set search_path = public, net, pg_catalog, pg_temp
as $function$
declare
  run_id uuid;
  network_request_id bigint;
  started_at timestamptz := clock_timestamp();
begin
  if nullif(btrim(p_job_key), '') is null
     or nullif(btrim(p_function_name), '') is null
     or nullif(btrim(p_url), '') is null then
    raise exception 'Tracked Edge request requires job key, function name, and URL';
  end if;

  insert into public.cron_job_runs(
    job_key,
    job_name,
    function_name,
    source,
    status,
    started_at,
    created_at,
    message,
    metadata
  ) values (
    p_job_key,
    p_job_key,
    p_function_name,
    'pg_net_tracked',
    'running',
    started_at,
    started_at,
    p_job_key || ' request dispatched.',
    jsonb_build_object('truthful_http_monitoring', true)
  )
  returning id into run_id;

  insert into public.cron_jobs(
    job_key,
    job_name,
    route_path,
    source,
    is_active,
    last_status,
    last_started_at,
    last_message,
    updated_at
  ) values (
    p_job_key,
    p_job_key,
    'supabase/functions/' || p_function_name,
    'edge_function',
    true,
    'running',
    started_at,
    p_job_key || ' request dispatched.',
    started_at
  )
  on conflict (job_key) do update set
    last_status = 'running',
    last_started_at = excluded.last_started_at,
    last_message = excluded.last_message,
    updated_at = excluded.updated_at;

  network_request_id := net.http_post(
    url := p_url,
    headers := jsonb_build_object('Content-Type', 'application/json') || coalesce(p_headers, '{}'::jsonb),
    body := coalesce(p_body, '{}'::jsonb) || jsonb_build_object('_cron_run_id', run_id),
    timeout_milliseconds := greatest(1000, least(coalesce(p_timeout_milliseconds, 55000), 120000))
  );

  update public.cron_job_runs
  set request_id = network_request_id,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('request_id', network_request_id)
  where id = run_id;

  return network_request_id;
exception when others then
  if run_id is not null then
    update public.cron_job_runs
    set status = 'failed',
        finished_at = clock_timestamp(),
        completed_at = clock_timestamp(),
        duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer),
        transport_status = 'dispatch_error',
        error_message = sqlerrm,
        message = p_job_key || ' dispatch failed.',
        reconciled_at = clock_timestamp()
    where id = run_id;
  end if;
  raise;
end
$function$;

create or replace function private.reconcile_tracked_edge_requests(
  p_stale_after interval default interval '10 minutes'
)
returns integer
language plpgsql
security definer
set search_path = public, net, pg_catalog, pg_temp
as $function$
declare
  response_row record;
  completed_count integer := 0;
  is_success boolean;
  final_error text;
begin
  for response_row in
    select
      runs.id,
      runs.job_key,
      runs.started_at,
      responses.status_code,
      responses.timed_out,
      responses.error_msg,
      responses.content,
      responses.created
    from public.cron_job_runs runs
    join net._http_response responses on responses.id = runs.request_id
    where runs.source = 'pg_net_tracked'
      and runs.status in ('running', 'started')
  loop
    is_success := response_row.status_code between 200 and 299
      and not coalesce(response_row.timed_out, false)
      and response_row.error_msg is null
      and not private.response_declares_failure(response_row.content);

    final_error := case
      when coalesce(response_row.timed_out, false) then 'pg_net request timed out'
      when response_row.error_msg is not null then response_row.error_msg
      when response_row.status_code is null then 'pg_net returned no HTTP status'
      when response_row.status_code not between 200 and 299 then 'Edge Function returned HTTP ' || response_row.status_code
      when private.response_declares_failure(response_row.content) then 'Edge Function response declared failure'
      else null
    end;

    update public.cron_job_runs
    set status = case when is_success then 'success' else 'failed' end,
        finished_at = response_row.created,
        completed_at = response_row.created,
        duration_ms = greatest(0, floor(extract(epoch from (response_row.created - response_row.started_at)) * 1000)::integer),
        http_status = response_row.status_code,
        transport_status = case
          when coalesce(response_row.timed_out, false) then 'timeout'
          when response_row.error_msg is not null then 'transport_error'
          when is_success then 'completed'
          else 'http_error'
        end,
        response_excerpt = left(response_row.content, 1000),
        error_message = final_error,
        message = case when is_success
          then response_row.job_key || ' completed successfully.'
          else response_row.job_key || ' failed.'
        end,
        reconciled_at = clock_timestamp()
    where id = response_row.id;

    update public.cron_jobs
    set last_status = case when is_success then 'success' else 'failed' end,
        last_completed_at = case when is_success then response_row.created else last_completed_at end,
        last_failed_at = case when is_success then last_failed_at else response_row.created end,
        last_duration_ms = greatest(0, floor(extract(epoch from (response_row.created - response_row.started_at)) * 1000)::integer),
        last_message = case when is_success
          then response_row.job_key || ' completed successfully.'
          else response_row.job_key || ' failed.'
        end,
        last_error = final_error,
        updated_at = clock_timestamp()
    where job_key = response_row.job_key;

    completed_count := completed_count + 1;
  end loop;

  with stale as (
    update public.cron_job_runs
    set status = 'failed',
        finished_at = clock_timestamp(),
        completed_at = clock_timestamp(),
        duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer),
        transport_status = 'response_missing',
        error_message = 'No pg_net response was available before the reconciliation deadline',
        message = job_key || ' failed without a correlated response.',
        reconciled_at = clock_timestamp()
    where source = 'pg_net_tracked'
      and status in ('running', 'started')
      and started_at < clock_timestamp() - greatest(p_stale_after, interval '2 minutes')
    returning job_key, completed_at, duration_ms, error_message
  ), updated_registry as (
    update public.cron_jobs jobs
    set last_status = 'failed',
        last_failed_at = stale.completed_at,
        last_duration_ms = stale.duration_ms,
        last_message = stale.job_key || ' failed without a correlated response.',
        last_error = stale.error_message,
        updated_at = clock_timestamp()
    from stale
    where jobs.job_key = stale.job_key
    returning jobs.job_key
  )
  select completed_count + count(*) into completed_count from updated_registry;

  return completed_count;
end
$function$;

create or replace function public.worker_reliability_soak_report(p_window_days integer default 7)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $function$
declare
  window_days integer := greatest(1, least(coalesce(p_window_days, 7), 30));
  window_start timestamptz;
  first_tracked_at timestamptz;
  observed_days numeric;
  transport_failures integer;
  false_green_runs integer;
  overdue_requests integer;
  dead_letters integer;
  stale_running integer;
  overdue_queued integer;
  registry_drift integer;
  report_passes boolean;
begin
  window_start := clock_timestamp() - make_interval(days => window_days);

  select min(started_at) into first_tracked_at
  from public.cron_job_runs
  where source = 'pg_net_tracked';

  observed_days := case
    when first_tracked_at is null then 0
    else least(window_days::numeric, extract(epoch from (clock_timestamp() - first_tracked_at)) / 86400.0)
  end;

  select count(*) into transport_failures
  from public.cron_job_runs
  where source = 'pg_net_tracked'
    and started_at >= window_start
    and status in ('failed', 'error');

  select count(*) into false_green_runs
  from public.cron_job_runs
  where source = 'pg_net_tracked'
    and started_at >= window_start
    and status = 'success'
    and (http_status is null or http_status not between 200 and 299 or transport_status <> 'completed');

  select count(*) into overdue_requests
  from public.cron_job_runs
  where source = 'pg_net_tracked'
    and status in ('running', 'started')
    and started_at < clock_timestamp() - interval '10 minutes';

  select count(*) into dead_letters
  from public.worker_jobs
  where status = 'dead_letter'
    and updated_at >= window_start;

  select count(*) into stale_running
  from public.worker_jobs
  where status = 'running'
    and coalesce(lease_expires_at, heartbeat_at + interval '5 minutes') < clock_timestamp();

  select count(*) into overdue_queued
  from public.worker_jobs
  where status = 'queued'
    and run_after < clock_timestamp() - interval '5 minutes';

  select count(*) into registry_drift
  from public.cron_jobs jobs
  where jobs.is_active is true
    and jobs.last_status = 'never_run'
    and exists (
      select 1
      from public.cron_job_runs runs
      where runs.job_key = jobs.job_key
        and runs.created_at >= window_start
    );

  report_passes := observed_days >= window_days
    and transport_failures = 0
    and false_green_runs = 0
    and overdue_requests = 0
    and dead_letters = 0
    and stale_running = 0
    and overdue_queued = 0
    and registry_drift = 0;

  return jsonb_build_object(
    'passing', report_passes,
    'state', case when observed_days < window_days then 'collecting' when report_passes then 'passed' else 'failed' end,
    'window_days', window_days,
    'observed_days', round(observed_days, 2),
    'first_tracked_at', first_tracked_at,
    'checked_at', clock_timestamp(),
    'metrics', jsonb_build_object(
      'transport_failures', transport_failures,
      'false_green_runs', false_green_runs,
      'overdue_requests', overdue_requests,
      'dead_letters', dead_letters,
      'stale_running_jobs', stale_running,
      'overdue_queued_jobs', overdue_queued,
      'registry_drift', registry_drift
    )
  );
end
$function$;

revoke all on function private.response_declares_failure(text) from public, anon, authenticated;
revoke all on function private.dispatch_tracked_edge_request(text, text, text, jsonb, jsonb, integer) from public, anon, authenticated;
revoke all on function private.reconcile_tracked_edge_requests(interval) from public, anon, authenticated;
revoke all on function public.worker_reliability_soak_report(integer) from public, anon, authenticated;
grant execute on function public.worker_reliability_soak_report(integer) to service_role;

-- Remove every legacy worker poller before replacing them with one unified lane.
do $cron_cleanup$
declare
  existing_job record;
begin
  for existing_job in
    select jobid
    from cron.job
    where jobname in (
      'worker-photos',
      'worker-notifications',
      'worker-enrichment',
      'worker-operations',
      'worker-maintenance',
      'worker-dispatcher-unified',
      'worker-http-response-reconciler'
    )
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$cron_cleanup$;

select cron.schedule(
  'worker-dispatcher-unified',
  '* * * * *',
  $cron$
    select private.dispatch_tracked_edge_request(
      p_job_key := 'worker-dispatcher-unified',
      p_function_name := 'worker-dispatcher',
      p_url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/worker-dispatcher',
      p_headers := jsonb_build_object(
        'x-worker-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'worker_internal_secret'
          limit 1
        )
      ),
      p_body := jsonb_build_object(
        'limit', 25,
        'lease_seconds', 300,
        'worker_name', 'production-unified-worker',
        'job_types', jsonb_build_array(
          'photo.backfill',
          'enrichment.google_photos',
          'nightly-photo-backfill',
          'enrichment.google_metadata',
          'search.anchor.reconcile',
          'search.qa.batch',
          'reservation.cleanup',
          'search.document_rebuild',
          'search.embedding_generation',
          'analytics.aggregate',
          'enrichment.ai_profile',
          'enrichment.ai_menu',
          'ml.duplicate_detection.recalculate',
          'review.moderation',
          'location.publishability_repair'
        )
      ),
      p_timeout_milliseconds := 55000
    );
  $cron$
);

select cron.schedule(
  'worker-http-response-reconciler',
  '* * * * *',
  $cron$select private.reconcile_tracked_edge_requests();$cron$
);

-- The current outing-reminders implementation only marks timestamps as sent;
-- it does not deliver email or SMS. Leaving the schedule active risks silent
-- notification loss, so fail closed until a delivery contract is implemented.
do $outing_cleanup$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'outing-reminders'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$outing_cleanup$;

update public.cron_jobs
set is_active = false,
    last_status = 'failed',
    last_failed_at = clock_timestamp(),
    last_error = 'Disabled: existing function marks reminders sent without delivering a notification.',
    last_message = 'Outing reminders are paused until end-to-end delivery is implemented.',
    updated_at = clock_timestamp()
where job_key = 'outing-reminders';

-- Recreate the valid giveaway digest with durable HTTP outcome tracking.
do $giveaway_cleanup$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'admin-giveaway-review-reminder'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end
$giveaway_cleanup$;

select cron.schedule(
  'admin-giveaway-review-reminder',
  '0 13 * * *',
  $cron$
    select private.dispatch_tracked_edge_request(
      p_job_key := 'admin-giveaway-review-reminder',
      p_function_name := 'admin-giveaway-review-reminder',
      p_url := concat(
        rtrim(current_setting('app.supabase_url', true), '/'),
        '/functions/v1/admin-giveaway-review-reminder'
      ),
      p_headers := jsonb_build_object(
        'x-cron-secret', current_setting('app.cron_secret', true),
        'Authorization', concat('Bearer ', current_setting('app.supabase_service_role_key', true))
      ),
      p_body := '{"source":"cron","dryRun":false}'::jsonb,
      p_timeout_milliseconds := 55000
    );
  $cron$
);

