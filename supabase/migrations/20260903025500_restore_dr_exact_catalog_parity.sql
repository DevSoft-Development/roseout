-- Restore the remaining exact writable-catalog parity required before a DR reseed.
-- Safe/idempotent on Virginia and Oregon.

-- Canonical Stamps amount type is numeric(12,4).
do $dr$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema='public'
      and table_name='mailing_batch_items'
      and column_name='stamps_postage_amount'
      and (numeric_precision is distinct from 12 or numeric_scale is distinct from 4)
  ) then
    alter table public.mailing_batch_items
      alter column stamps_postage_amount type numeric(12,4)
      using stamps_postage_amount::numeric(12,4);
  end if;
end
$dr$;

-- Restore the canonical Stamps status constraint.
do $dr$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.mailing_batch_items'::regclass
      and conname='mailing_batch_items_stamps_postage_status_check'
  ) then
    alter table public.mailing_batch_items
      add constraint mailing_batch_items_stamps_postage_status_check
      check (
        stamps_postage_status is null
        or stamps_postage_status = any (array['reserved'::text,'purchased'::text,'manual_review'::text])
      );
  end if;
end
$dr$;

create unique index if not exists mailing_batch_items_stamps_integrator_tx_id_uidx
  on public.mailing_batch_items using btree (stamps_integrator_tx_id)
  where stamps_integrator_tx_id is not null;

create index if not exists mailing_batch_items_stamps_postage_status_idx
  on public.mailing_batch_items using btree (stamps_postage_status)
  where stamps_postage_status is not null;

create unique index if not exists mailing_batch_items_stamps_tx_id_uidx
  on public.mailing_batch_items using btree (stamps_tx_id)
  where stamps_tx_id is not null;

-- The Oregon copy contained two comments inside this function body that changed
-- the catalog hash but not behavior. Replace both regions with the Virginia
-- canonical definition so the exact DR schema gate can compare byte-equivalent
-- function definitions again.
create or replace function private.signal_unified_location_gap_repair_work()
returns trigger
language plpgsql
security definer
set search_path = 'pg_catalog', 'public', 'private'
as $function$
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
$function$;
