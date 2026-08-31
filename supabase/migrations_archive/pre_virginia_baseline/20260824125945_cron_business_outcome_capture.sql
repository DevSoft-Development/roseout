create or replace function private.try_parse_jsonb(p_text text)
returns jsonb
language plpgsql
immutable
set search_path = pg_catalog, pg_temp
as $$
begin
  if p_text is null or btrim(p_text) = '' then
    return null;
  end if;
  return p_text::jsonb;
exception when others then
  return null;
end;
$$;

revoke all on function private.try_parse_jsonb(text) from public, anon, authenticated;

create or replace function private.reconcile_tracked_edge_requests(p_stale_after interval default '00:10:00'::interval)
returns integer
language plpgsql
security definer
set search_path to 'public', 'net', 'pg_catalog', 'pg_temp'
as $$
declare
  response_row record;
  completed_count integer := 0;
  is_success boolean;
  final_error text;
  response_json jsonb;
begin
  for response_row in
    select runs.id, runs.job_key, runs.started_at, responses.status_code, responses.timed_out,
      responses.error_msg, responses.content, responses.created
    from public.cron_job_runs runs
    join net._http_response responses on responses.id = runs.request_id
    where runs.source = 'pg_net_tracked'
      and runs.status in ('running', 'started')
  loop
    response_json := private.try_parse_jsonb(response_row.content);
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
      when response_json is null then 'Edge Function returned a non-JSON response'
      else null
    end;

    if response_json is null then
      is_success := false;
    end if;

    update public.cron_job_runs
    set status = case when is_success then 'success' else 'failed' end,
        finished_at = response_row.created,
        completed_at = response_row.created,
        duration_ms = greatest(0, floor(extract(epoch from (response_row.created - response_row.started_at)) * 1000)::integer),
        http_status = response_row.status_code,
        transport_status = case
          when coalesce(response_row.timed_out, false) then 'timeout'
          when response_row.error_msg is not null then 'transport_error'
          when response_json is null then 'invalid_response'
          when is_success then 'completed'
          else 'http_error'
        end,
        response_excerpt = left(response_row.content, 1000),
        details = coalesce(response_json, details, '{}'::jsonb),
        error_message = final_error,
        message = case when is_success then response_row.job_key || ' completed successfully.' else response_row.job_key || ' failed.' end,
        reconciled_at = clock_timestamp()
    where id = response_row.id;

    update public.cron_jobs
    set last_status = case when is_success then 'success' else 'failed' end,
        last_completed_at = case when is_success then response_row.created else last_completed_at end,
        last_failed_at = case when is_success then last_failed_at else response_row.created end,
        last_duration_ms = greatest(0, floor(extract(epoch from (response_row.created - response_row.started_at)) * 1000)::integer),
        last_message = case when is_success then response_row.job_key || ' completed successfully.' else response_row.job_key || ' failed.' end,
        last_details = coalesce(response_json, last_details, '{}'::jsonb),
        last_error = final_error,
        updated_at = clock_timestamp()
    where job_key = response_row.job_key;

    completed_count := completed_count + 1;
  end loop;

  with stale as (
    update public.cron_job_runs
    set status = 'failed', finished_at = clock_timestamp(), completed_at = clock_timestamp(),
        duration_ms = greatest(0, floor(extract(epoch from (clock_timestamp() - started_at)) * 1000)::integer),
        transport_status = 'response_missing', error_message = 'No pg_net response was available before the reconciliation deadline',
        message = job_key || ' failed without a correlated response.', reconciled_at = clock_timestamp()
    where source = 'pg_net_tracked'
      and status in ('running', 'started')
      and started_at < clock_timestamp() - greatest(p_stale_after, interval '2 minutes')
    returning job_key, completed_at, duration_ms, error_message
  ), updated_registry as (
    update public.cron_jobs jobs
    set last_status = 'failed', last_failed_at = stale.completed_at, last_duration_ms = stale.duration_ms,
        last_message = stale.job_key || ' failed without a correlated response.', last_error = stale.error_message,
        updated_at = clock_timestamp()
    from stale where jobs.job_key = stale.job_key
    returning jobs.job_key
  )
  select completed_count + count(*) into completed_count from updated_registry;

  return completed_count;
end
$$;

create or replace function private.run_cleanup_expired_auth_email_tokens_cron()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  started_at timestamptz := clock_timestamp();
  deleted_count integer := 0;
  result jsonb;
begin
  deleted_count := public.cleanup_expired_auth_email_tokens();
  result := jsonb_build_object('processed', deleted_count, 'deleted', deleted_count, 'fixed', deleted_count, 'failed', 0);
  insert into public.cron_job_runs(job_key, job_name, status, source, started_at, completed_at, finished_at, duration_ms, checked_count, success_count, failed_count, message, details)
  values ('cleanup-expired-auth-email-tokens', 'Cleanup Expired Auth Email Tokens', 'success', 'pg_cron_sql', started_at, clock_timestamp(), clock_timestamp(), greatest(0, floor(extract(epoch from (clock_timestamp() - started_at))*1000)::integer), deleted_count, deleted_count, 0, 'Expired auth email token cleanup completed.', result);
  update public.cron_jobs set last_status='success', last_completed_at=clock_timestamp(), last_duration_ms=greatest(0, floor(extract(epoch from (clock_timestamp() - started_at))*1000)::integer), last_message='Expired auth email token cleanup completed.', last_details=result, last_error=null, updated_at=clock_timestamp() where job_key='cleanup-expired-auth-email-tokens';
  return result;
exception when others then
  insert into public.cron_job_runs(job_key, job_name, status, source, started_at, completed_at, finished_at, duration_ms, failed_count, error_message, message, details)
  values ('cleanup-expired-auth-email-tokens', 'Cleanup Expired Auth Email Tokens', 'failed', 'pg_cron_sql', started_at, clock_timestamp(), clock_timestamp(), greatest(0, floor(extract(epoch from (clock_timestamp() - started_at))*1000)::integer), 1, sqlerrm, 'Expired auth email token cleanup failed.', jsonb_build_object('failed',1));
  update public.cron_jobs set last_status='failed', last_failed_at=clock_timestamp(), last_error=sqlerrm, last_message='Expired auth email token cleanup failed.', updated_at=clock_timestamp() where job_key='cleanup-expired-auth-email-tokens';
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
  started_at timestamptz := clock_timestamp();
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
    from public.location_enrichment_run_items i group by i.run_id
  )
  update public.location_enrichment_runs r
  set processed_records=stats.processed, review_records=stats.review, no_match_records=stats.no_match,
      failed_records=stats.failed, enriched_records=stats.enriched, unchanged_records=stats.unchanged,
      skipped_records=stats.skipped, updated_at=clock_timestamp()
  from stats where stats.run_id=r.id and r.status='running';
  get diagnostics refreshed_runs = row_count;

  update public.location_enrichment_runs r
  set status='completed', completed_at=coalesce(r.completed_at,clock_timestamp()), updated_at=clock_timestamp()
  where r.status='running'
    and not exists (select 1 from public.location_enrichment_run_items i where i.run_id=r.id and i.status in ('pending','processing'));
  get diagnostics completed_runs = row_count;

  result := jsonb_build_object('processed', requeued_count + refreshed_runs + completed_runs, 'requeued', requeued_count,
    'updated', refreshed_runs, 'fixed', requeued_count + completed_runs, 'runs_completed', completed_runs, 'failed', 0);
  insert into public.cron_job_runs(job_key,job_name,status,source,started_at,completed_at,finished_at,duration_ms,checked_count,success_count,failed_count,message,details)
  values ('location-enrichment-reconcile','Location Enrichment Reconcile','success','pg_cron_sql',started_at,clock_timestamp(),clock_timestamp(),greatest(0,floor(extract(epoch from (clock_timestamp()-started_at))*1000)::integer),requeued_count+refreshed_runs+completed_runs,requeued_count+refreshed_runs+completed_runs,0,'Location enrichment reconciliation completed.',result);
  update public.cron_jobs set last_status='success',last_completed_at=clock_timestamp(),last_duration_ms=greatest(0,floor(extract(epoch from (clock_timestamp()-started_at))*1000)::integer),last_message='Location enrichment reconciliation completed.',last_details=result,last_error=null,updated_at=clock_timestamp() where job_key='location-enrichment-reconcile';
  return result;
exception when others then
  insert into public.cron_job_runs(job_key,job_name,status,source,started_at,completed_at,finished_at,duration_ms,failed_count,error_message,message,details)
  values ('location-enrichment-reconcile','Location Enrichment Reconcile','failed','pg_cron_sql',started_at,clock_timestamp(),clock_timestamp(),greatest(0,floor(extract(epoch from (clock_timestamp()-started_at))*1000)::integer),1,sqlerrm,'Location enrichment reconciliation failed.',jsonb_build_object('failed',1));
  update public.cron_jobs set last_status='failed',last_failed_at=clock_timestamp(),last_error=sqlerrm,last_message='Location enrichment reconciliation failed.',updated_at=clock_timestamp() where job_key='location-enrichment-reconcile';
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
  started_at timestamptz := clock_timestamp();
  reconciled_count integer := 0;
  result jsonb;
begin
  reconciled_count := private.reconcile_tracked_edge_requests();
  result := jsonb_build_object('processed', reconciled_count, 'reconciled', reconciled_count, 'fixed', reconciled_count, 'failed', 0);
  insert into public.cron_job_runs(job_key,job_name,status,source,started_at,completed_at,finished_at,duration_ms,checked_count,success_count,failed_count,message,details)
  values ('worker-http-response-reconciler','Worker HTTP Response Reconciler','success','pg_cron_sql',started_at,clock_timestamp(),clock_timestamp(),greatest(0,floor(extract(epoch from (clock_timestamp()-started_at))*1000)::integer),reconciled_count,reconciled_count,0,'Tracked Edge responses reconciled.',result);
  update public.cron_jobs set last_status='success',last_completed_at=clock_timestamp(),last_duration_ms=greatest(0,floor(extract(epoch from (clock_timestamp()-started_at))*1000)::integer),last_message='Tracked Edge responses reconciled.',last_details=result,last_error=null,updated_at=clock_timestamp() where job_key='worker-http-response-reconciler';
  return result;
exception when others then
  insert into public.cron_job_runs(job_key,job_name,status,source,started_at,completed_at,finished_at,duration_ms,failed_count,error_message,message,details)
  values ('worker-http-response-reconciler','Worker HTTP Response Reconciler','failed','pg_cron_sql',started_at,clock_timestamp(),clock_timestamp(),greatest(0,floor(extract(epoch from (clock_timestamp()-started_at))*1000)::integer),1,sqlerrm,'Tracked Edge response reconciliation failed.',jsonb_build_object('failed',1));
  update public.cron_jobs set last_status='failed',last_failed_at=clock_timestamp(),last_error=sqlerrm,last_message='Tracked Edge response reconciliation failed.',updated_at=clock_timestamp() where job_key='worker-http-response-reconciler';
  raise;
end;
$$;

revoke all on function private.run_cleanup_expired_auth_email_tokens_cron() from public, anon, authenticated;
revoke all on function private.run_location_enrichment_reconcile_cron() from public, anon, authenticated;
revoke all on function private.run_worker_http_response_reconciler_cron() from public, anon, authenticated;

select cron.schedule('cleanup-expired-auth-email-tokens','15 3 * * *','select private.run_cleanup_expired_auth_email_tokens_cron();');
select cron.schedule('location-enrichment-reconcile','*/5 * * * *','select private.run_location_enrichment_reconcile_cron();');
select cron.schedule('worker-http-response-reconciler','* * * * *','select private.run_worker_http_response_reconciler_cron();');

select cron.schedule('career-automation-worker','*/10 * * * *',$cmd$
select private.dispatch_tracked_edge_request('career-automation-worker','career-automation-worker','https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/career-automation-worker',jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='worker_internal_secret' limit 1)),jsonb_build_object('source','cron'),55000);$cmd$);
select cron.schedule('fraud-sweep-15m','*/15 * * * *',$cmd$
select private.dispatch_tracked_edge_request('fraud-sweep-15m','fraud-sweep','https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/fraud-sweep',jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='worker_internal_secret' limit 1)),jsonb_build_object('source','supabase_cron','scheduled_at',now()),30000);$cmd$);
select cron.schedule('reservation-sms-phrase-learning','17 * * * *',$cmd$
select private.dispatch_tracked_edge_request('reservation-sms-phrase-learning','reservation-sms-phrase-learning',(select decrypted_secret from vault.decrypted_secrets where name='reservation_project_url' limit 1) || '/functions/v1/reservation-sms-phrase-learning',jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='reservation_cron_secret' limit 1)),'{"source":"cron"}'::jsonb,55000);$cmd$);
select cron.schedule('support-resolved-auto-close-hourly','7 * * * *',$cmd$
select private.dispatch_tracked_edge_request('support-resolved-auto-close-hourly','support-automation-worker','https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/support-automation-worker',jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='worker_internal_secret' limit 1)),jsonb_build_object('operation','automations','limit',250),15000);$cmd$);
select cron.schedule('support-response-learning-hourly','17 * * * *',$cmd$
select private.dispatch_tracked_edge_request('support-response-learning-hourly','support-learning-worker','https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/support-learning-worker',jsonb_build_object('Content-Type','application/json','x-worker-secret',(select decrypted_secret from vault.decrypted_secrets where name='worker_internal_secret' limit 1)),jsonb_build_object('operation','learn','limit',250),15000);$cmd$);
select cron.schedule('unified-location-gap-repair','* * * * *',$cmd$
select private.dispatch_tracked_edge_request('unified-location-gap-repair','unified-location-gap-repair',(select decrypted_secret from vault.decrypted_secrets where name='reservation_project_url' limit 1) || '/functions/v1/unified-location-gap-repair',jsonb_build_object('Content-Type','application/json','x-cron-secret',(select decrypted_secret from vault.decrypted_secrets where name='reservation_cron_secret' limit 1)),'{"source":"cron","limit":50,"concurrency":8,"textSearchLimit":3}'::jsonb,55000);$cmd$);
