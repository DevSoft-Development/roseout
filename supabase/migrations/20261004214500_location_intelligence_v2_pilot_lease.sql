-- Serialize the controlled Location Intelligence V2 pilot so overlapping AWS
-- signals cannot allocate the same remaining quota or exceed the 100-location cap.

create schema if not exists private;

create table if not exists private.location_intelligence_v2_pilot_leases (
  pilot_id text primary key,
  owner_token uuid,
  locked_until timestamptz not null default 'epoch'::timestamptz,
  updated_at timestamptz not null default now()
);

alter table private.location_intelligence_v2_pilot_leases enable row level security;

revoke all on table private.location_intelligence_v2_pilot_leases from public, anon, authenticated;
grant select, update on table private.location_intelligence_v2_pilot_leases to service_role;

insert into private.location_intelligence_v2_pilot_leases (pilot_id, locked_until)
values ('initial_100_v1', 'epoch'::timestamptz)
on conflict (pilot_id) do nothing;

create or replace function public.acquire_location_intelligence_v2_pilot_lease(
  p_pilot_id text,
  p_owner_token uuid,
  p_lease_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  update private.location_intelligence_v2_pilot_leases
  set owner_token = p_owner_token,
      locked_until = clock_timestamp() + make_interval(
        secs => greatest(60, least(coalesce(p_lease_seconds, 600), 1800))
      ),
      updated_at = clock_timestamp()
  where pilot_id = p_pilot_id
    and locked_until < clock_timestamp();

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.acquire_location_intelligence_v2_pilot_lease(text, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.acquire_location_intelligence_v2_pilot_lease(text, uuid, integer)
  to service_role;

create or replace function public.release_location_intelligence_v2_pilot_lease(
  p_pilot_id text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = private, pg_temp
as $$
declare
  v_updated integer := 0;
begin
  update private.location_intelligence_v2_pilot_leases
  set owner_token = null,
      locked_until = 'epoch'::timestamptz,
      updated_at = clock_timestamp()
  where pilot_id = p_pilot_id
    and owner_token = p_owner_token;

  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$$;

revoke all on function public.release_location_intelligence_v2_pilot_lease(text, uuid)
  from public, anon, authenticated;
grant execute on function public.release_location_intelligence_v2_pilot_lease(text, uuid)
  to service_role;


-- Keep the existing database signal producer authoritative for manual pilot dispatch.
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
    'cron-alert-dispatcher',
    'search-ml-learning-maintenance',
    'location-intelligence-v2-pilot'
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

revoke all on function private.emit_aws_background_work_signal(text, interval)
  from public, anon, authenticated;
