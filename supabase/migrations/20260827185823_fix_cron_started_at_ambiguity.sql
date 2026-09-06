-- Fix PL/pgSQL variable/column ambiguity in cron worker functions.
-- PostgreSQL raises 42702 when a local variable and a table column share the
-- same unqualified identifier. Keep behavior unchanged; only rename the local
-- timestamp variable to v_started_at.

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
  v_started_at timestamptz := clock_timestamp();
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
    v_started_at,
    v_started_at,
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
    v_started_at,
    p_job_key || ' request dispatched.',
    v_started_at
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
        duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at)) * 1000)::integer),
        transport_status = 'dispatch_error',
        error_message = sqlerrm,
        message = p_job_key || ' dispatch failed.',
        reconciled_at = clock_timestamp()
    where id = run_id;
  end if;
  raise;
end
$function$;

revoke all on function private.dispatch_tracked_edge_request(text, text, text, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function private.dispatch_tracked_edge_request(text, text, text, jsonb, jsonb, integer) to service_role;

create or replace function private.run_cleanup_expired_auth_email_tokens_cron()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_started_at timestamptz := clock_timestamp();
  deleted_count integer := 0;
  result jsonb;
begin
  deleted_count := public.cleanup_expired_auth_email_tokens();
  result := jsonb_build_object('processed', deleted_count, 'deleted', deleted_count, 'fixed', deleted_count, 'failed', 0);

  insert into public.cron_job_runs(job_key, job_name, status, source, started_at, completed_at, finished_at, duration_ms, checked_count, success_count, failed_count, message, details)
  values ('cleanup-expired-auth-email-tokens', 'Cleanup Expired Auth Email Tokens', 'success', 'pg_cron_sql', v_started_at, clock_timestamp(), clock_timestamp(), greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at))*1000)::integer), deleted_count, deleted_count, 0, 'Expired auth email token cleanup completed.', result);

  update public.cron_jobs
  set last_status='success', last_completed_at=clock_timestamp(), last_duration_ms=greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at))*1000)::integer), last_message='Expired auth email token cleanup completed.', last_details=result, last_error=null, updated_at=clock_timestamp()
  where job_key='cleanup-expired-auth-email-tokens';

  return result;
exception when others then
  insert into public.cron_job_runs(job_key, job_name, status, source, started_at, completed_at, finished_at, duration_ms, failed_count, error_message, message, details)
  values ('cleanup-expired-auth-email-tokens', 'Cleanup Expired Auth Email Tokens', 'failed', 'pg_cron_sql', v_started_at, clock_timestamp(), clock_timestamp(), greatest(0, floor(extract(epoch from (clock_timestamp() - v_started_at))*1000)::integer), 1, sqlerrm, 'Expired auth email token cleanup failed.', jsonb_build_object('failed',1));

  update public.cron_jobs
  set last_status='failed', last_failed_at=clock_timestamp(), last_error=sqlerrm, last_message='Expired auth email token cleanup failed.', updated_at=clock_timestamp()
  where job_key='cleanup-expired-auth-email-tokens';
  raise;
end;
$$;

create or replace function private.run_location_enrichment_reconcile_cron()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_started_at timestamptz := clock_timestamp();
  requeued_count integer := 0;
  refreshed_runs integer := 0;
  completed_runs integer := 0;
  result jsonb;
begin
  update public.location_enrichment_run_items i
  set status='pending', last_error=coalesce(i.last_error,'Recovered from interrupted enrichment batch; queued for retry.'), updated_at=clock_timestamp()
  where i.status='processing' and i.updated_at < clock_timestamp() - interval '10 minutes'
    and exists (select 1 from public.location_enrichment_runs r where r.id=i.run_id and r.status='running');
  get diagnostics requeued_count = row_count;

  with stats as (
    select i.run_id,
      count(*) filter (where i.status in ('completed','unchanged','skipped','failed','review','no_match'))::integer as processed,
      count(*) filter (where i.status='review')::integer as review,
      count(*) filter (where i.status='no_match')::integer as no_match,
      count(*) filter (where i.status='failed')::integer as failed,
      count(*) filter (where i.status in ('completed','review') and jsonb_typeof(i.match_diagnostics->'changedFields')='array' and jsonb_array_length(i.match_diagnostics->'changedFields')>0)::integer as enriched,
      count(*) filter (where i.status='unchanged')::integer as unchanged,
      count(*) filter (where i.status in ('skipped','no_match'))::integer as skipped
    from public.location_enrichment_run_items i
    group by i.run_id
  )
  update public.location_enrichment_runs r
  set processed_records=stats.processed, review_records=stats.review, no_match_records=stats.no_match,
      failed_records=stats.failed, enriched_records=stats.enriched, unchanged_records=stats.unchanged,
      skipped_records=stats.skipped, updated_at=clock_timestamp()
  from stats
  where stats.run_id=r.id and r.status='running';
  get diagnostics refreshed_runs = row_count;

  update public.location_enrichment_runs r
  set status='completed', completed_at=coalesce(r.completed_at,clock_timestamp()), updated_at=clock_timestamp()
  where r.status='running'
    and not exists (select 1 from public.location_enrichment_run_items i where i.run_id=r.id and i.status in ('pending','processing'));
  get diagnostics completed_runs = row_count;

  result := jsonb_build_object('processed', requeued_count + refreshed_runs + completed_runs, 'requeued', requeued_count,
    'updated', refreshed_runs, 'fixed', requeued_count + completed_runs, 'runs_completed', completed_runs, 'failed', 0);

  insert into public.cron_job_runs(job_key,job_name,status,source,started_at,completed_at,finished_at,duration_ms,checked_count,success_count,failed_count,message,details)
  values ('location-enrichment-reconcile','Location Enrichment Reconcile','success','pg_cron_sql',v_started_at,clock_timestamp(),clock_timestamp(),greatest(0,floor(extract(epoch from (clock_timestamp()-v_started_at))*1000)::integer),requeued_count+refreshed_runs+completed_runs,requeued_count+refreshed_runs+completed_runs,0,'Location enrichment reconciliation completed.',result);

  update public.cron_jobs
  set last_status='success',last_completed_at=clock_timestamp(),last_duration_ms=greatest(0,floor(extract(epoch from (clock_timestamp()-v_started_at))*1000)::integer),last_message='Location enrichment reconciliation completed.',last_details=result,last_error=null,updated_at=clock_timestamp()
  where job_key='location-enrichment-reconcile';

  return result;
exception when others then
  insert into public.cron_job_runs(job_key,job_name,status,source,started_at,completed_at,finished_at,duration_ms,failed_count,error_message,message,details)
  values ('location-enrichment-reconcile','Location Enrichment Reconcile','failed','pg_cron_sql',v_started_at,clock_timestamp(),clock_timestamp(),greatest(0,floor(extract(epoch from (clock_timestamp()-v_started_at))*1000)::integer),1,sqlerrm,'Location enrichment reconciliation failed.',jsonb_build_object('failed',1));

  update public.cron_jobs
  set last_status='failed',last_failed_at=clock_timestamp(),last_error=sqlerrm,last_message='Location enrichment reconciliation failed.',updated_at=clock_timestamp()
  where job_key='location-enrichment-reconcile';
  raise;
end;
$$;

create or replace function private.run_worker_http_response_reconciler_cron()
returns jsonb
language plpgsql
security definer
set search_path = public, private, pg_catalog, pg_temp
as $$
declare
  v_started_at timestamptz := clock_timestamp();
  reconciled_count integer := 0;
  result jsonb;
begin
  reconciled_count := private.reconcile_tracked_edge_requests();
  result := jsonb_build_object('processed', reconciled_count, 'reconciled', reconciled_count, 'fixed', reconciled_count, 'failed', 0);

  insert into public.cron_job_runs(job_key,job_name,status,source,started_at,completed_at,finished_at,duration_ms,checked_count,success_count,failed_count,message,details)
  values ('worker-http-response-reconciler','Worker HTTP Response Reconciler','success','pg_cron_sql',v_started_at,clock_timestamp(),clock_timestamp(),greatest(0,floor(extract(epoch from (clock_timestamp()-v_started_at))*1000)::integer),reconciled_count,reconciled_count,0,'Tracked Edge responses reconciled.',result);

  update public.cron_jobs
  set last_status='success',last_completed_at=clock_timestamp(),last_duration_ms=greatest(0,floor(extract(epoch from (clock_timestamp()-v_started_at))*1000)::integer),last_message='Tracked Edge responses reconciled.',last_details=result,last_error=null,updated_at=clock_timestamp()
  where job_key='worker-http-response-reconciler';

  return result;
exception when others then
  insert into public.cron_job_runs(job_key,job_name,status,source,started_at,completed_at,finished_at,duration_ms,failed_count,error_message,message,details)
  values ('worker-http-response-reconciler','Worker HTTP Response Reconciler','failed','pg_cron_sql',v_started_at,clock_timestamp(),clock_timestamp(),greatest(0,floor(extract(epoch from (clock_timestamp()-v_started_at))*1000)::integer),1,sqlerrm,'Tracked Edge response reconciliation failed.',jsonb_build_object('failed',1));

  update public.cron_jobs
  set last_status='failed',last_failed_at=clock_timestamp(),last_error=sqlerrm,last_message='Tracked Edge response reconciliation failed.',updated_at=clock_timestamp()
  where job_key='worker-http-response-reconciler';
  raise;
end;
$$;

revoke all on function private.run_cleanup_expired_auth_email_tokens_cron() from public, anon, authenticated;
revoke all on function private.run_location_enrichment_reconcile_cron() from public, anon, authenticated;
revoke all on function private.run_worker_http_response_reconciler_cron() from public, anon, authenticated;
