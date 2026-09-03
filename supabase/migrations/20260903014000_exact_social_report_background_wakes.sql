-- Schedule due-time work through exact AWS EventBridge one-shots while retaining hourly recovery sweeps.
-- Virginia pg_cron remains intentionally empty. Oregon stays passive because its AWS signal URL is unset.

create or replace function private.emit_aws_scheduled_background_work_signal(
  p_job text,
  p_schedule_key text,
  p_run_at timestamptz default null,
  p_cancel boolean default false,
  p_payload jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private', 'vault', 'net'
as $$
declare
  endpoint text;
  token text;
  request_id bigint;
  body jsonb;
begin
  if p_job not in ('marketing-report-scheduler', 'marketing-social-publish') then
    raise exception 'unsupported_scheduled_background_work_signal_job:%', p_job;
  end if;

  if nullif(btrim(p_schedule_key), '') is null then
    raise exception 'scheduled_background_work_signal_key_required';
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

  body := jsonb_build_object(
    'job', p_job,
    'scheduleKey', p_schedule_key,
    'cancel', p_cancel,
    'payload', coalesce(p_payload, '{}'::jsonb)
  );

  -- Near-due work is queued immediately; future work becomes an exact one-shot schedule.
  if not p_cancel and p_run_at is not null and p_run_at > clock_timestamp() + interval '2 seconds' then
    body := body || jsonb_build_object('runAt', p_run_at);
  end if;

  select net.http_post(
    url := endpoint,
    body := body,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-toh-work-signal', token
    ),
    timeout_milliseconds := 2000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function private.emit_aws_scheduled_background_work_signal(text, text, timestamptz, boolean, jsonb)
  from public, anon, authenticated;

create or replace function private.signal_marketing_report_schedule()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  row_id uuid;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;

  if tg_op = 'DELETE' then
    perform private.emit_aws_scheduled_background_work_signal(
      'marketing-report-scheduler',
      row_id::text,
      null,
      true,
      '{}'::jsonb
    );
    return old;
  end if;

  if coalesce(new.is_active, false) and new.next_run_at is not null then
    perform private.emit_aws_scheduled_background_work_signal(
      'marketing-report-scheduler',
      row_id::text,
      new.next_run_at,
      false,
      jsonb_build_object('schedule_id', row_id)
    );
  else
    perform private.emit_aws_scheduled_background_work_signal(
      'marketing-report-scheduler',
      row_id::text,
      null,
      true,
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke all on function private.signal_marketing_report_schedule() from public, anon, authenticated;

drop trigger if exists trg_signal_marketing_report_schedule on public.marketing_report_schedules;
create trigger trg_signal_marketing_report_schedule
after insert or update of is_active, next_run_at or delete
on public.marketing_report_schedules
for each row execute function private.signal_marketing_report_schedule();

create or replace function private.signal_social_publish_schedule()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  row_id uuid;
  run_at timestamptz;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;

  if tg_op = 'DELETE' then
    perform private.emit_aws_scheduled_background_work_signal(
      'marketing-social-publish',
      row_id::text,
      null,
      true,
      '{}'::jsonb
    );
    return old;
  end if;

  if new.status = 'queued' then
    run_at := new.scheduled_at;
  elsif new.status = 'retrying' then
    run_at := greatest(new.scheduled_at, coalesce(new.next_retry_at, new.scheduled_at));
  else
    run_at := null;
  end if;

  if run_at is not null then
    perform private.emit_aws_scheduled_background_work_signal(
      'marketing-social-publish',
      row_id::text,
      run_at,
      false,
      jsonb_build_object('publish_job_id', row_id)
    );
  else
    perform private.emit_aws_scheduled_background_work_signal(
      'marketing-social-publish',
      row_id::text,
      null,
      true,
      '{}'::jsonb
    );
  end if;

  return new;
end;
$$;

revoke all on function private.signal_social_publish_schedule() from public, anon, authenticated;

drop trigger if exists trg_signal_social_publish_schedule on public.social_publish_jobs;
create trigger trg_signal_social_publish_schedule
after insert or update of status, scheduled_at, next_retry_at or delete
on public.social_publish_jobs
for each row execute function private.signal_social_publish_schedule();

-- Bootstrap any existing future work. Current production tables are empty, but this keeps the migration safe for other environments.
select private.emit_aws_scheduled_background_work_signal(
  'marketing-report-scheduler',
  id::text,
  next_run_at,
  false,
  jsonb_build_object('schedule_id', id)
)
from public.marketing_report_schedules
where is_active = true
  and next_run_at is not null;

select private.emit_aws_scheduled_background_work_signal(
  'marketing-social-publish',
  id::text,
  case
    when status = 'retrying' then greatest(scheduled_at, coalesce(next_retry_at, scheduled_at))
    else scheduled_at
  end,
  false,
  jsonb_build_object('publish_job_id', id)
)
from public.social_publish_jobs
where status in ('queued', 'retrying');
