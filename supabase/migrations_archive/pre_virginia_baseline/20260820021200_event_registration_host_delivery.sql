alter table public.event_ticket_orders
  add column if not exists host_email_delivery_status text not null default 'pending' check (host_email_delivery_status in ('pending','sent','failed','skipped')),
  add column if not exists host_sms_delivery_status text not null default 'pending' check (host_sms_delivery_status in ('pending','sent','failed','skipped')),
  add column if not exists host_delivery_error text null,
  add column if not exists host_delivery_attempted_at timestamptz null;

comment on column public.event_ticket_orders.host_email_delivery_status is 'Delivery state for the owning location/organizer registration alert email.';
comment on column public.event_ticket_orders.host_sms_delivery_status is 'Delivery state for the owning location/organizer registration alert SMS.';
