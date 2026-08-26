alter table public.outings
  add column if not exists external_booking_followup_phone text null;

create index if not exists idx_outings_external_booking_followup_phone
  on public.outings(external_booking_followup_phone, external_booking_started_at desc)
  where external_booking_status = 'started' and external_booking_followup_sent_at is not null;
