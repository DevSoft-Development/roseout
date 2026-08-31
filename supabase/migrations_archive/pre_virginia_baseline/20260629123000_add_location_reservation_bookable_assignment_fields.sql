alter table if exists public.location_reservations
  add column if not exists bookable_item_id uuid,
  add column if not exists bookable_item_name text,
  add column if not exists bookable_item_type text;

alter table if exists public.location_reservations
  add column if not exists updated_at timestamptz;

create index if not exists location_reservations_bookable_item_idx
  on public.location_reservations(location_id, reservation_date, bookable_item_id)
  where bookable_item_id is not null;

create index if not exists location_reservations_bookable_name_idx
  on public.location_reservations(location_id, reservation_date, bookable_item_name)
  where bookable_item_name is not null;
