-- TheOutHaven cron/import digest diagnostics.
-- Safe output only: do not paste secrets into this file or diagnostic results.

select
  jobid,
  jobname,
  schedule,
  active,
  (regexp_match(command, '/functions/v1/([a-zA-Z0-9_-]+)'))[1] as function_name,
  command ilike '%Authorization%' as has_authorization_header,
  command ilike '%x-cron-secret%' as has_cron_secret_header,
  command ilike '%YOUR_PROJECT_REF%' or command ilike '%YOUR_CRON_SECRET%' or command ilike '%PASTE_%' as has_placeholder_values,
  command ilike '%functions/v1/%' as has_supabase_function_url
from cron.job
where jobname ilike '%theouthaven%'
   or jobname in ('nightly-photo-backfill','beta-tester-reminders','admin-search-health-digest','admin-cron-digest-email','nightly-demo-reset','team-session-watchdog')
   or command ilike '%functions/v1/%'
   or command ilike '%theouthaven%'
order by jobname;

select jobid, jobname, schedule, active
from cron.job
where (jobname ilike '%theouthaven%' or command ilike '%functions/v1/%')
  and command not ilike '%Authorization%'
order by jobname;

select jobid, jobname, schedule, active
from cron.job
where (jobname ilike '%theouthaven%' or command ilike '%functions/v1/%')
  and command not ilike '%x-cron-secret%'
order by jobname;

select jobid, jobname, schedule, active
from cron.job
where command ilike '%YOUR_PROJECT_REF%'
   or command ilike '%YOUR_CRON_SECRET%'
   or command ilike '%PASTE_%'
order by jobname;

select *
from net._http_response
order by created desc
limit 50;

select *
from public.cron_job_runs
order by created_at desc
limit 50;

select *
from public.cron_job_runs
where status = 'failed' or error_message is not null
order by created_at desc
limit 50;

do $$
begin
  if to_regclass('public.edge_function_logs') is not null then
    raise notice 'Run this query for latest edge function logs: select * from public.edge_function_logs order by created_at desc limit 50;';
  else
    raise notice 'public.edge_function_logs table does not exist in this database.';
  end if;
end $$;

-- Latest edge_function_logs rows, if that table exists.
create temp table if not exists tmp_latest_edge_function_logs(row_data jsonb) on commit drop;

do $$
begin
  if to_regclass('public.edge_function_logs') is not null then
    execute 'insert into tmp_latest_edge_function_logs(row_data) select to_jsonb(edge_function_logs.*) from public.edge_function_logs order by created_at desc limit 50';
  end if;
end $$;

select row_data
from tmp_latest_edge_function_logs;
