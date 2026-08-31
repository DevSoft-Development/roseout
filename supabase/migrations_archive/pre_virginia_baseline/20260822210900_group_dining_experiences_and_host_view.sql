alter table public.experiences
  add column if not exists experience_type text not null default 'standard',
  add column if not exists pricing_model text not null default 'per_person',
  add column if not exists price_per_table numeric not null default 0,
  add column if not exists seats_per_table integer,
  add column if not exists prepayment_required boolean not null default false,
  add column if not exists cancellation_policy text;

alter table public.experiences drop constraint if exists experiences_experience_type_check;
alter table public.experiences add constraint experiences_experience_type_check check (experience_type in ('standard','group_dining'));
alter table public.experiences drop constraint if exists experiences_pricing_model_check;
alter table public.experiences add constraint experiences_pricing_model_check check (pricing_model in ('free','per_person','per_table','fixed_package'));
alter table public.experiences drop constraint if exists experiences_price_per_table_check;
alter table public.experiences add constraint experiences_price_per_table_check check (price_per_table >= 0);
alter table public.experiences drop constraint if exists experiences_seats_per_table_check;
alter table public.experiences add constraint experiences_seats_per_table_check check (seats_per_table is null or seats_per_table > 0);

alter table public.experience_slots
  add column if not exists tables_available integer;
alter table public.experience_slots drop constraint if exists experience_slots_tables_available_check;
alter table public.experience_slots add constraint experience_slots_tables_available_check check (tables_available is null or tables_available > 0);

alter table public.experience_bookings
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists amount_cents integer not null default 0,
  add column if not exists pricing_model text,
  add column if not exists tables_reserved integer,
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_payment_intent_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists source_reservation_id uuid references public.location_reservations(id) on delete set null;

alter table public.experience_bookings drop constraint if exists experience_bookings_status_check;
alter table public.experience_bookings add constraint experience_bookings_status_check check (status in ('pending_payment','confirmed','cancelled','completed','no_show'));
alter table public.experience_bookings drop constraint if exists experience_bookings_payment_status_check;
alter table public.experience_bookings add constraint experience_bookings_payment_status_check check (payment_status in ('not_required','pending','paid','failed','refunded'));
alter table public.experience_bookings drop constraint if exists experience_bookings_amount_cents_check;
alter table public.experience_bookings add constraint experience_bookings_amount_cents_check check (amount_cents >= 0);
alter table public.experience_bookings drop constraint if exists experience_bookings_tables_reserved_check;
alter table public.experience_bookings add constraint experience_bookings_tables_reserved_check check (tables_reserved is null or tables_reserved > 0);

alter table public.location_reservations
  add column if not exists converted_experience_id uuid references public.experiences(id) on delete set null,
  add column if not exists converted_to_experience_at timestamptz;

create index if not exists experience_bookings_source_reservation_idx on public.experience_bookings(source_reservation_id) where source_reservation_id is not null;
create index if not exists experience_bookings_payment_intent_idx on public.experience_bookings(provider_payment_intent_id) where provider_payment_intent_id is not null;
create index if not exists experiences_location_group_dining_idx on public.experiences(location_id, experience_type, status) where location_id is not null;
create index if not exists location_reservations_converted_experience_idx on public.location_reservations(converted_experience_id) where converted_experience_id is not null;
