-- Make location enrichment reconciliation event-driven for normal state changes.
-- Virginia pg_cron remains intentionally empty. EventBridge remains a recovery sweep only.

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
    'location-enrichment-reconcile'
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

create or replace function private.signal_location_enrichment_reconcile_item_work()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
declare
  run_id_to_check uuid;
  should_signal boolean := false;
begin
  if tg_op = 'DELETE' then
    run_id_to_check := old.run_id;
    should_signal := true;
  elsif tg_op = 'INSERT' then
    run_id_to_check := new.run_id;
    should_signal := new.status in ('completed', 'unchanged', 'skipped', 'failed', 'review', 'no_match');
  else
    run_id_to_check := new.run_id;
    should_signal := old.status is distinct from new.status
      and (
        old.status in ('completed', 'unchanged', 'skipped', 'failed', 'review', 'no_match')
        or new.status in ('completed', 'unchanged', 'skipped', 'failed', 'review', 'no_match')
      );
  end if;

  if should_signal and exists (
    select 1
    from public.location_enrichment_runs r
    where r.id = run_id_to_check
      and r.status = 'running'
  ) then
    perform private.emit_aws_background_work_signal(
      'location-enrichment-reconcile',
      interval '5 seconds'
    );
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.signal_location_enrichment_reconcile_run_work()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $$
begin
  if new.status = 'running'
    and (tg_op = 'INSERT' or old.status is distinct from new.status)
  then
    perform private.emit_aws_background_work_signal(
      'location-enrichment-reconcile',
      interval '5 seconds'
    );
  end if;
  return new;
end;
$$;

revoke all on function private.signal_location_enrichment_reconcile_item_work() from public, anon, authenticated;
revoke all on function private.signal_location_enrichment_reconcile_run_work() from public, anon, authenticated;

drop trigger if exists trg_signal_location_enrichment_reconcile_item_work
  on public.location_enrichment_run_items;
create trigger trg_signal_location_enrichment_reconcile_item_work
after insert or update of status or delete
on public.location_enrichment_run_items
for each row execute function private.signal_location_enrichment_reconcile_item_work();

drop trigger if exists trg_signal_location_enrichment_reconcile_run_work
  on public.location_enrichment_runs;
create trigger trg_signal_location_enrichment_reconcile_run_work
after insert or update of status
on public.location_enrichment_runs
for each row execute function private.signal_location_enrichment_reconcile_run_work();
