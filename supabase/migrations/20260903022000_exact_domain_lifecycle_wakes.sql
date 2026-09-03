-- Keep active domain provisioning responsive with deterministic AWS EventBridge one-shots.
-- The hourly EventBridge schedule remains a recovery sweep. Virginia pg_cron stays empty;
-- Oregon remains passive because its aws_background_work_signal_url secret is intentionally unset.

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
  if p_job not in ('marketing-report-scheduler', 'marketing-social-publish', 'domain-lifecycle') then
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

create or replace function private.signal_domain_lifecycle_schedule()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  row_id uuid;
  active_domain boolean;
  immediate_wake boolean := false;
  run_at timestamptz;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;

  if tg_op = 'DELETE' then
    perform private.emit_aws_scheduled_background_work_signal(
      'domain-lifecycle', row_id::text, null, true, '{}'::jsonb
    );
    return old;
  end if;

  active_domain := nullif(btrim(coalesce(new.included_domain_name, '')), '') is not null
    and lower(coalesce(new.included_domain_status, '')) = 'active';

  if not active_domain or lower(coalesce(new.included_domain_connection_status, '')) = 'live' then
    perform private.emit_aws_scheduled_background_work_signal(
      'domain-lifecycle', row_id::text, null, true, '{}'::jsonb
    );
    return new;
  end if;

  if tg_op = 'INSERT' then
    immediate_wake := true;
  else
    immediate_wake := old.included_domain_name is distinct from new.included_domain_name
      or old.included_domain_status is distinct from new.included_domain_status;
  end if;

  -- Activation/name assignment wakes immediately. State transitions produced by the lifecycle
  -- worker schedule the next deterministic check five minutes later.
  run_at := case when immediate_wake then null else clock_timestamp() + interval '5 minutes' end;

  perform private.emit_aws_scheduled_background_work_signal(
    'domain-lifecycle',
    row_id::text,
    run_at,
    false,
    '{}'::jsonb
  );

  return new;
end;
$$;

revoke all on function private.signal_domain_lifecycle_schedule() from public, anon, authenticated;

drop trigger if exists trg_signal_domain_lifecycle_schedule on public.locations;
create trigger trg_signal_domain_lifecycle_schedule
after insert or update of included_domain_name, included_domain_status, included_domain_connection_status, included_domain_verification_checked_at or delete
on public.locations
for each row execute function private.signal_domain_lifecycle_schedule();

-- Bootstrap any existing active non-live domains. Production currently has none, but this keeps
-- rollout safe for development and future restore environments.
select private.emit_aws_scheduled_background_work_signal(
  'domain-lifecycle', id::text, null, false, '{}'::jsonb
)
from public.locations
where nullif(btrim(coalesce(included_domain_name, '')), '') is not null
  and lower(coalesce(included_domain_status, '')) = 'active'
  and lower(coalesce(included_domain_connection_status, '')) <> 'live';
