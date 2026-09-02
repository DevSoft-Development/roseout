-- Event-driven signals for the remaining idle one-minute repair loops.
--
-- Claim QR work is signaled when its durable worker_jobs row is created.
-- Location gap repair is signaled when a location insert/update creates repair
-- debt. The worker's own gap_repair_last_checked_at updates are explicitly
-- ignored to prevent feedback loops. EventBridge remains recovery-only.

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
    'location-description-backfill',
    'claim-qr-repair-worker',
    'unified-location-gap-repair'
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
end
$$;

revoke all on function private.emit_aws_background_work_signal(text, interval) from public, anon, authenticated;

create or replace function private.signal_claim_qr_repair_work()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if new.job_type = 'claim.qr_repair'
     and new.status = 'queued'
     and coalesce(new.run_after, clock_timestamp()) <= clock_timestamp() + interval '5 seconds' then
    perform private.emit_aws_background_work_signal(
      'claim-qr-repair-worker',
      interval '5 seconds'
    );
  end if;
  return new;
end
$$;

revoke all on function private.signal_claim_qr_repair_work() from public, anon, authenticated;

drop trigger if exists trg_signal_claim_qr_repair_work on public.worker_jobs;
create trigger trg_signal_claim_qr_repair_work
after insert on public.worker_jobs
for each row execute function private.signal_claim_qr_repair_work();

create or replace function private.signal_unified_location_gap_repair_work()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  is_managed boolean;
  core_gap boolean;
  reservation_gap boolean;
  menu_gap boolean;
  reservation_status text;
begin
  if new.deleted_at is not null or coalesce(new.is_demo, false) then
    return new;
  end if;

  -- Every gap-repair write stamps this field. Ignore those writes so the worker
  -- cannot signal itself while repairing a location.
  if tg_op = 'UPDATE'
     and old.gap_repair_last_checked_at is distinct from new.gap_repair_last_checked_at then
    return new;
  end if;

  is_managed := coalesce(nullif(btrim(new.profile_managed_by), ''), '') <> ''
    or coalesce(new.profile_manual_lock, false);

  core_gap := not is_managed and (
    new.operating_hours is null
    or nullif(btrim(coalesce(new.website, '')), '') is null
    or nullif(btrim(coalesce(new.phone, '')), '') is null
  );

  reservation_status := coalesce(new.reservation_discovery_status, '');
  reservation_gap :=
    nullif(btrim(coalesce(new.external_reservation_url, '')), '') is null
    and nullif(btrim(coalesce(new.reservation_url, '')), '') is null
    and nullif(btrim(coalesce(new.reservation_link, '')), '') is null
    and nullif(btrim(coalesce(new.booking_url, '')), '') is null
    and (
      new.reservation_discovery_checked_at is null
      or reservation_status in ('failed', 'blocked')
      or (reservation_status = 'no_website' and nullif(btrim(coalesce(new.website, '')), '') is not null)
      or (reservation_status = '' and nullif(btrim(coalesce(new.website, '')), '') is not null)
    );

  menu_gap := lower(coalesce(new.location_type, '')) = 'restaurant'
    and not is_managed
    and nullif(btrim(coalesce(new.website, '')), '') is not null
    and (
      new.menu_discovery_checked_at is null
      or new.menu_discovery_status in ('pending', 'stale')
      or (
        nullif(btrim(coalesce(new.menu_url, '')), '') is not null
        and (
          new.menu_intelligence_checked_at is null
          or coalesce(new.menu_intelligence_version, '') <> 'v1'
        )
      )
    );

  if core_gap or reservation_gap or menu_gap then
    perform private.emit_aws_background_work_signal(
      'unified-location-gap-repair',
      interval '20 seconds'
    );
  end if;

  return new;
end
$$;

revoke all on function private.signal_unified_location_gap_repair_work() from public, anon, authenticated;

drop trigger if exists trg_signal_unified_location_gap_repair_work on public.locations;
create trigger trg_signal_unified_location_gap_repair_work
after insert or update of
  operating_hours,
  website,
  phone,
  google_place_id,
  google_regular_opening_hours,
  google_current_opening_hours,
  external_reservation_url,
  reservation_url,
  reservation_link,
  booking_url,
  menu_url,
  location_type,
  profile_managed_by,
  profile_manual_lock,
  deleted_at,
  is_demo
on public.locations
for each row execute function private.signal_unified_location_gap_repair_work();
