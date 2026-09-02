-- Event-driven AWS background work signals.
--
-- The database emits authenticated, asynchronous pg_net signals only when work
-- is created or a worker completes a batch. EventBridge remains a low-frequency
-- recovery mechanism; Virginia pg_cron remains intentionally empty.

create table if not exists private.aws_background_work_signal_state (
  job_key text primary key,
  last_signaled_at timestamptz not null default '-infinity'::timestamptz,
  last_request_id bigint,
  updated_at timestamptz not null default now()
);

revoke all on table private.aws_background_work_signal_state from public, anon, authenticated;

do $$
declare
  existing_id uuid;
begin
  select id into existing_id
  from vault.secrets
  where name = 'aws_background_work_signal_secret'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(
      replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
      'aws_background_work_signal_secret',
      'Authenticates Virginia database work signals to the AWS background work signal gateway.',
      null
    );
  end if;
end
$$;

create or replace function public.verify_aws_background_work_signal(p_token text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, vault
as $$
  select exists (
    select 1
    from vault.decrypted_secrets
    where name = 'aws_background_work_signal_secret'
      and decrypted_secret = coalesce(p_token, '')
  );
$$;

revoke all on function public.verify_aws_background_work_signal(text) from public, anon, authenticated;
grant execute on function public.verify_aws_background_work_signal(text) to service_role;

create or replace function public.configure_aws_background_work_signal_url(p_url text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, vault
as $$
declare
  existing_id uuid;
  normalized text := btrim(coalesce(p_url, ''));
begin
  if normalized = ''
     or normalized !~ '^https://[a-zA-Z0-9.-]+\.lambda-url\.[a-z0-9-]+\.on\.aws/$' then
    raise exception 'invalid_background_work_signal_url';
  end if;

  select id into existing_id
  from vault.secrets
  where name = 'aws_background_work_signal_url'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(
      normalized,
      'aws_background_work_signal_url',
      'AWS Lambda Function URL used by Virginia pg_net work signals.',
      null
    );
  else
    perform vault.update_secret(
      existing_id,
      normalized,
      'aws_background_work_signal_url',
      'AWS Lambda Function URL used by Virginia pg_net work signals.',
      null
    );
  end if;
end
$$;

revoke all on function public.configure_aws_background_work_signal_url(text) from public, anon, authenticated;
grant execute on function public.configure_aws_background_work_signal_url(text) to service_role;

create or replace function private.emit_aws_background_work_signal(
  p_job text,
  p_min_interval interval default interval '20 seconds'
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, public, private, vault, net
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
    'location-description-backfill'
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

  -- The endpoint is configured only after the AWS stack is live. Before then,
  -- triggers are deliberately harmless and the recovery schedules remain active.
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
end
$$;

revoke all on function private.emit_aws_background_work_signal(text, interval) from public, anon, authenticated;

create or replace function private.signal_location_search_profile_work()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.status = 'pending'
     or (tg_op = 'UPDATE' and old.status = 'processing' and new.status <> 'processing') then
    perform private.emit_aws_background_work_signal('location-search-profile-worker');
  end if;
  return new;
end
$$;

revoke all on function private.signal_location_search_profile_work() from public, anon, authenticated;

drop trigger if exists trg_signal_location_search_profile_refresh_work on public.location_search_profile_refresh_queue;
create trigger trg_signal_location_search_profile_refresh_work
after insert or update of status, available_at on public.location_search_profile_refresh_queue
for each row execute function private.signal_location_search_profile_work();

drop trigger if exists trg_signal_location_search_profile_run_item_work on public.location_search_profile_run_items;
create trigger trg_signal_location_search_profile_run_item_work
after insert or update of status, available_at on public.location_search_profile_run_items
for each row execute function private.signal_location_search_profile_work();

create or replace function private.signal_catalog_enrichment_work()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if tg_table_name = 'location_enrichment_runs' then
    if new.status = 'running' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
      perform private.emit_aws_background_work_signal('catalog-enrichment-runner');
    end if;
  elsif tg_table_name = 'location_enrichment_run_items' then
    if tg_op = 'UPDATE'
       and old.status = 'processing'
       and new.status in ('review','completed','unchanged','skipped','no_match','failed') then
      perform private.emit_aws_background_work_signal('catalog-enrichment-runner');
    end if;
  end if;
  return new;
end
$$;

revoke all on function private.signal_catalog_enrichment_work() from public, anon, authenticated;

drop trigger if exists trg_signal_location_enrichment_run_work on public.location_enrichment_runs;
create trigger trg_signal_location_enrichment_run_work
after insert or update of status on public.location_enrichment_runs
for each row execute function private.signal_catalog_enrichment_work();

drop trigger if exists trg_signal_location_enrichment_item_completion on public.location_enrichment_run_items;
create trigger trg_signal_location_enrichment_item_completion
after update of status on public.location_enrichment_run_items
for each row execute function private.signal_catalog_enrichment_work();

create or replace function private.signal_location_description_backfill_work()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  should_signal boolean := false;
begin
  if tg_op = 'INSERT' then
    should_signal := nullif(btrim(coalesce(new.description, '')), '') is null;
  else
    should_signal := (
      nullif(btrim(coalesce(new.description, '')), '') is null
      and (
        old.description is distinct from new.description
        or old.description_backfill_status is distinct from new.description_backfill_status
      )
    ) or (
      nullif(btrim(coalesce(old.description, '')), '') is null
      and nullif(btrim(coalesce(new.description, '')), '') is not null
    );
  end if;

  if should_signal then
    perform private.emit_aws_background_work_signal('location-description-backfill');
  end if;
  return new;
end
$$;

revoke all on function private.signal_location_description_backfill_work() from public, anon, authenticated;

drop trigger if exists trg_signal_location_description_backfill_work on public.locations;
create trigger trg_signal_location_description_backfill_work
after insert or update of description, description_backfill_status on public.locations
for each row execute function private.signal_location_description_backfill_work();
