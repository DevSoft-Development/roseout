-- Location Intelligence PR 5: reservation discovery persistence, retry, and freshness.
-- This migration does not publish locations or alter dedupe behavior.

alter table public.locations
  add column if not exists reservation_discovery_attempts integer not null default 0,
  add column if not exists reservation_discovery_last_attempt_at timestamptz,
  add column if not exists reservation_discovery_next_retry_at timestamptz,
  add column if not exists reservation_discovery_verified_at timestamptz,
  add column if not exists reservation_discovery_stale_at timestamptz;

alter table public.locations
  drop constraint if exists locations_reservation_discovery_attempts_nonnegative;

alter table public.locations
  add constraint locations_reservation_discovery_attempts_nonnegative
  check (reservation_discovery_attempts >= 0);

create index if not exists locations_reservation_discovery_next_retry_idx
  on public.locations (reservation_discovery_next_retry_at)
  where reservation_discovery_next_retry_at is not null and deleted_at is null;

create index if not exists locations_reservation_discovery_stale_idx
  on public.locations (reservation_discovery_stale_at)
  where reservation_discovery_stale_at is not null and deleted_at is null;

-- Seed historical discovery state before the trigger exists. This makes older
-- not-found/failed/blocked rows eligible on the new cadence instead of leaving
-- them permanently stuck. Manual overrides are intentionally excluded.
update public.locations
set
  reservation_discovery_last_attempt_at = coalesce(
    reservation_discovery_last_attempt_at,
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ),
  reservation_discovery_verified_at = coalesce(
    reservation_discovery_verified_at,
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ),
  reservation_discovery_stale_at = coalesce(
    reservation_discovery_stale_at,
    coalesce(reservation_discovery_checked_at, reservation_last_checked_at, updated_at) + interval '30 days'
  ),
  reservation_discovery_next_retry_at = coalesce(
    reservation_discovery_next_retry_at,
    coalesce(reservation_discovery_checked_at, reservation_last_checked_at, updated_at) + interval '30 days'
  )
where deleted_at is null
  and coalesce(reservation_manual_override, false) = false
  and reservation_discovery_status = 'found';

update public.locations
set
  reservation_discovery_last_attempt_at = coalesce(
    reservation_discovery_last_attempt_at,
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ),
  reservation_discovery_next_retry_at = coalesce(
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ) + interval '7 days',
  gap_repair_next_attempt_at = coalesce(
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ) + interval '7 days',
  reservation_discovery_checked_at = null
where deleted_at is null
  and coalesce(reservation_manual_override, false) = false
  and reservation_discovery_status = 'not_found';

update public.locations
set
  reservation_discovery_last_attempt_at = coalesce(
    reservation_discovery_last_attempt_at,
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ),
  reservation_discovery_next_retry_at = coalesce(
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ) + interval '7 days',
  gap_repair_next_attempt_at = coalesce(
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ) + interval '7 days'
where deleted_at is null
  and coalesce(reservation_manual_override, false) = false
  and reservation_discovery_status = 'failed';

update public.locations
set
  reservation_discovery_last_attempt_at = coalesce(
    reservation_discovery_last_attempt_at,
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ),
  reservation_discovery_next_retry_at = coalesce(
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ) + interval '30 days',
  gap_repair_next_attempt_at = coalesce(
    reservation_discovery_checked_at,
    reservation_last_checked_at,
    updated_at
  ) + interval '30 days'
where deleted_at is null
  and coalesce(reservation_manual_override, false) = false
  and reservation_discovery_status = 'blocked';

create or replace function public.apply_reservation_discovery_freshness()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  checked_at timestamptz;
  next_retry timestamptz;
begin
  if new.reservation_discovery_checked_at is not distinct from old.reservation_discovery_checked_at
     and new.reservation_discovery_status is not distinct from old.reservation_discovery_status
     and new.reservation_manual_override is not distinct from old.reservation_manual_override then
    return new;
  end if;

  checked_at := coalesce(new.reservation_discovery_checked_at, now());

  if new.reservation_manual_override is true then
    new.reservation_discovery_next_retry_at := null;
    new.reservation_discovery_stale_at := null;
    return new;
  end if;

  if new.reservation_discovery_checked_at is distinct from old.reservation_discovery_checked_at
     and new.reservation_discovery_checked_at is not null then
    new.reservation_discovery_attempts := greatest(coalesce(old.reservation_discovery_attempts, 0), 0) + 1;
    new.reservation_discovery_last_attempt_at := new.reservation_discovery_checked_at;
  end if;

  case coalesce(new.reservation_discovery_status, '')
    when 'found' then
      new.reservation_discovery_verified_at := checked_at;
      new.reservation_discovery_stale_at := checked_at + interval '30 days';
      new.reservation_discovery_next_retry_at := checked_at + interval '30 days';
    when 'not_found' then
      next_retry := checked_at + interval '7 days';
      new.reservation_discovery_next_retry_at := next_retry;
      new.reservation_discovery_last_attempt_at := checked_at;
      -- Existing gap repair treats an unchecked row as eligible once its
      -- general retry gate is due. Preserve the actual attempt separately.
      new.reservation_discovery_checked_at := null;
      new.gap_repair_next_attempt_at := next_retry;
    when 'failed' then
      next_retry := checked_at + interval '7 days';
      new.reservation_discovery_next_retry_at := next_retry;
      new.gap_repair_next_attempt_at := next_retry;
    when 'blocked' then
      next_retry := checked_at + interval '30 days';
      new.reservation_discovery_next_retry_at := next_retry;
      new.gap_repair_next_attempt_at := next_retry;
    when 'no_website' then
      new.reservation_discovery_next_retry_at := null;
    when 'manual' then
      new.reservation_discovery_next_retry_at := null;
      new.reservation_discovery_stale_at := null;
    else
      null;
  end case;

  return new;
end;
$$;

drop trigger if exists trg_locations_reservation_discovery_freshness on public.locations;
create trigger trg_locations_reservation_discovery_freshness
before update of reservation_discovery_status, reservation_discovery_checked_at, reservation_manual_override
on public.locations
for each row
execute function public.apply_reservation_discovery_freshness();

create or replace function public.claim_due_reservation_verifications(p_limit integer default 25)
returns table(location_id uuid, reservation_url text, website text)
language sql
security invoker
set search_path = public
as $$
  select
    l.id,
    coalesce(l.reservation_external_url, l.external_reservation_url, l.reservation_url, l.reservation_link, l.booking_url) as reservation_url,
    l.website
  from public.locations l
  where l.deleted_at is null
    and coalesce(l.reservation_manual_override, false) = false
    and coalesce(l.reservation_discovery_status, '') = 'found'
    and l.reservation_discovery_stale_at is not null
    and l.reservation_discovery_stale_at <= now()
    and coalesce(l.reservation_external_url, l.external_reservation_url, l.reservation_url, l.reservation_link, l.booking_url) is not null
  order by l.reservation_discovery_stale_at asc
  limit least(greatest(coalesce(p_limit, 25), 1), 25);
$$;

revoke all on function public.claim_due_reservation_verifications(integer) from public, anon, authenticated;
grant execute on function public.claim_due_reservation_verifications(integer) to service_role;

comment on function public.claim_due_reservation_verifications(integer) is
  'Service-role-only bounded queue of stale discovered reservation links. Does not mutate or publish catalog rows.';
