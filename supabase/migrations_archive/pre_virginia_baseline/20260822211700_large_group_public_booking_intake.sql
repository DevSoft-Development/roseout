alter table public.location_reservations
  add column if not exists booking_kind text not null default 'standard',
  add column if not exists occasion text,
  add column if not exists prix_fixe_interest text,
  add column if not exists group_booking_notes text;

alter table public.location_reservations drop constraint if exists location_reservations_booking_kind_check;
alter table public.location_reservations add constraint location_reservations_booking_kind_check check (booking_kind in ('standard','large_group'));
alter table public.location_reservations drop constraint if exists location_reservations_prix_fixe_interest_check;
alter table public.location_reservations add constraint location_reservations_prix_fixe_interest_check check (prix_fixe_interest is null or prix_fixe_interest in ('no','yes','unsure'));

create index if not exists location_reservations_large_group_idx
  on public.location_reservations(location_id,reservation_date,reservation_time,status)
  where booking_kind='large_group';
