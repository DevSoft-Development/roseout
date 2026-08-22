alter table public.event_ticket_orders
  add column if not exists provider_refund_id text,
  add column if not exists refund_reason text,
  add column if not exists refund_requested_by uuid,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refund_application_fee_refunded boolean not null default false;

create unique index if not exists event_ticket_orders_provider_refund_id_key
  on public.event_ticket_orders(provider_refund_id)
  where provider_refund_id is not null;
