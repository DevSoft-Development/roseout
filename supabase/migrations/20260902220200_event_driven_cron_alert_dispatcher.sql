-- Make cron alert retry dispatch event-driven while retaining a 30-minute AWS recovery sweep.
-- Virginia pg_cron remains intentionally empty; Oregon remains passive because its signal URL is unset.

create or replace function private.emit_aws_background_work_signal(
  p_job text,
  p_min_interval interval default interval '20 seconds'
)
returns bigint
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private', 'vault', 'net'
as $$
declare
  endpoint text;
  token text;
  previous timestamptz;
  request_id bigint;
begin
  if p_job not in (
    'location-search-profile-worker',
    'catalog-enrichment-runner',
    'location-description-backfill',
    'claim-qr-repair-worker',
    'unified-location-gap-repair',
    'worker-dispatcher-unified',
    'location-enrichment-reconcile',
    'cron-alert-dispatcher'
  ) then
    raise exception 'unsupported_background_work_signal_job:%', p_job;
  end if;

  perform pg_advisory_xact_lock(hashtext('aws-background-work-signal:' || p_job));

  select last_signaled_at into previous
  from private.aws_background_work_signal_state
  where job_key = p_job;

  if previous is not null and previous > clock_timestamp() - p_min_interval then
    return null;
  end if;

  select decrypted_secret into endpoint
  from vault.decrypted_secrets
  where name = 'aws_background_work_signal_url'
  limit 1;

  select decrypted_secret into token
  from vault.decrypted_secrets
  where name = 'aws_background_work_signal_secret'
  limit 1;

  if nullif(btrim(endpoint), '') is null or nullif(btrim(token), '') is null then
    return null;
  end if;

  insert into private.aws_background_work_signal_state(job_key, last_signaled_at, updated_at)
  values (p_job, clock_timestamp(), clock_timestamp())
  on conflict (job_key) do update
    set last_signaled_at = excluded.last_signaled_at,
        updated_at = excluded.updated_at;

  select net.http_post(
    url := endpoint,
    body := jsonb_build_object('job', p_job),
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-toh-work-signal', token
    ),
    timeout_milliseconds := 2000
  ) into request_id;

  update private.aws_background_work_signal_state
  set last_request_id = request_id,
      updated_at = clock_timestamp()
  where job_key = p_job;

  return request_id;
end;
$$;

create or replace function private.signal_cron_alert_dispatcher_failure()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  is_failure boolean;
  changed_into_failure boolean;
begin
  if new.job_key = 'cron-alert-dispatcher' then
    return new;
  end if;

  is_failure := lower(coalesce(new.status::text, '')) in ('failed', 'error', 'failure')
    or nullif(btrim(coalesce(new.error_message, '')), '') is not null;

  changed_into_failure := tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.error_message is distinct from new.error_message;

  if is_failure
    and changed_into_failure
    and exists (
      select 1
      from public.cron_jobs j
      where j.job_key = new.job_key
        and coalesce(j.send_failure_email, false)
    )
  then
    perform private.emit_aws_background_work_signal(
      'cron-alert-dispatcher',
      interval '0 seconds'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.signal_cron_alert_dispatcher_failure() from public, anon, authenticated;

drop trigger if exists trg_signal_cron_alert_dispatcher_failure
  on public.cron_job_runs;
create trigger trg_signal_cron_alert_dispatcher_failure
after insert or update of status, error_message
on public.cron_job_runs
for each row execute function private.signal_cron_alert_dispatcher_failure();
