-- Close resolved support tickets after 48 hours with no customer response.
-- The support automation Edge Function already implements the auto_close_resolved rule.

update public.support_automation_rules
set minutes_after = 2880,
    enabled = true,
    updated_at = now()
where key = 'resolved_auto_close'
  and rule_type = 'auto_close_resolved';

-- Keep this lifecycle automation independently scheduled so it does not depend on
-- a dashboard request or unrelated worker-dispatcher activity.
do $$
declare
  existing_job_id bigint;
begin
  select jobid
    into existing_job_id
  from cron.job
  where jobname = 'support-resolved-auto-close-hourly'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end $$;

select cron.schedule(
  'support-resolved-auto-close-hourly',
  '7 * * * *',
  $cron$
  select net.http_post(
    url := 'https://hnhbzynoyrhjndefbwkh.supabase.co/functions/v1/support-automation-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-worker-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'worker_internal_secret'
        limit 1
      )
    ),
    body := jsonb_build_object('operation', 'automations', 'limit', 250),
    timeout_milliseconds := 15000
  );
  $cron$
);
