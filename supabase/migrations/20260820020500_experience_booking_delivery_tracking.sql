alter table public.experience_bookings
  add column if not exists delivery_error text null,
  add column if not exists delivery_attempted_at timestamptz null,
  add column if not exists host_email_delivery_status text not null default 'pending' check (host_email_delivery_status in ('pending','sent','failed','skipped')),
  add column if not exists host_sms_delivery_status text not null default 'pending' check (host_sms_delivery_status in ('pending','sent','failed','skipped')),
  add column if not exists host_delivery_error text null,
  add column if not exists host_delivery_attempted_at timestamptz null;

comment on column public.experience_bookings.host_email_delivery_status is 'Delivery state for the owning location/organizer booking notification email.';
comment on column public.experience_bookings.host_sms_delivery_status is 'Delivery state for the owning location/organizer booking notification SMS.';
