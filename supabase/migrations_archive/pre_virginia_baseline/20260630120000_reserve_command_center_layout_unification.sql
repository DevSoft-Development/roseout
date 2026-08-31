-- Unify Reserve Command Center layout fields across current and legacy layout resources.
alter table if exists public.layout_items add column if not exists duration_minutes integer;
alter table if exists public.layout_items add column if not exists default_duration_minutes integer;
alter table if exists public.layout_items add column if not exists reservation_duration_minutes integer;
alter table if exists public.layout_items add column if not exists notes text;

do $$
declare
  constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.layout_items'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format('alter table public.layout_items drop constraint if exists %I', constraint_record.conname);
  end loop;
exception
  when undefined_table then null;
end $$;

alter table if exists public.layout_items
  add constraint layout_items_status_check
  check (status in ('available', 'unavailable', 'hidden', 'reserved', 'occupied', 'cleaning', 'blocked', 'maintenance'));

create index if not exists layout_items_location_active_idx on public.layout_items (location_id, is_active);
create index if not exists layout_items_location_source_active_idx on public.layout_items (location_id, source_table, is_active);

do $$
begin
  if to_regclass('public.location_bookable_items') is not null then
    create index if not exists location_bookable_items_location_active_idx on public.location_bookable_items (location_id, is_active);
  end if;
end $$;
