alter table public.outings
  add column if not exists external_booking_status text null,
  add column if not exists external_booking_location_id uuid null references public.locations(id) on delete set null,
  add column if not exists external_booking_provider text null,
  add column if not exists external_booking_started_at timestamptz null,
  add column if not exists external_booking_confirmed_at timestamptz null,
  add column if not exists external_booking_confirmation_source text null,
  add column if not exists external_booking_failed_at timestamptz null,
  add column if not exists external_booking_failure_source text null,
  add column if not exists external_booking_followup_sent_at timestamptz null;

alter table public.outings drop constraint if exists outings_external_booking_status_check;
alter table public.outings add constraint outings_external_booking_status_check
  check (external_booking_status is null or external_booking_status in ('available','started','confirmed','failed','abandoned'));

create index if not exists idx_outings_external_booking_followup
  on public.outings(external_booking_status, external_booking_started_at)
  where external_booking_status = 'started' and external_booking_confirmed_at is null;
