alter table if exists public.reservation_waitlist
  add column if not exists converted_reservation_id uuid;

alter table if exists public.reservation_waitlist
  add column if not exists converted_at timestamptz;
