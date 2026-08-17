alter table public.locations
  add column if not exists description_backfill_status text,
  add column if not exists description_backfill_source text,
  add column if not exists description_backfill_checked_at timestamptz,
  add column if not exists description_backfill_error text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'locations_description_backfill_status_check'
      and conrelid = 'public.locations'::regclass
  ) then
    alter table public.locations
      add constraint locations_description_backfill_status_check
      check (description_backfill_status is null or description_backfill_status in ('generated','skipped','failed'));
  end if;
end $$;

create index if not exists locations_description_backfill_pending_idx
  on public.locations (id)
  where active = true
    and deleted_at is null
    and description is null
    and (description_backfill_status is null or description_backfill_status = 'failed');
