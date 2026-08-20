-- Paid event fee policy and immutable order fee snapshots.

alter table public.events
  add column if not exists platform_fee_bps integer not null default 500,
  add column if not exists fee_payer text not null default 'customer',
  add column if not exists customer_fee_share_bps integer not null default 10000;

alter table public.events drop constraint if exists events_platform_fee_bps_check;
alter table public.events add constraint events_platform_fee_bps_check
  check (platform_fee_bps between 0 and 2500);

alter table public.events drop constraint if exists events_fee_payer_check;
alter table public.events add constraint events_fee_payer_check
  check (fee_payer in ('customer','organizer','split'));

alter table public.events drop constraint if exists events_customer_fee_share_bps_check;
alter table public.events add constraint events_customer_fee_share_bps_check
  check (
    customer_fee_share_bps in (0, 5000, 10000)
    and (
      (fee_payer = 'organizer' and customer_fee_share_bps = 0)
      or (fee_payer = 'split' and customer_fee_share_bps = 5000)
      or (fee_payer = 'customer' and customer_fee_share_bps = 10000)
    )
  );

alter table public.event_ticket_orders drop constraint if exists event_ticket_orders_status_check;
alter table public.event_ticket_orders add constraint event_ticket_orders_status_check
  check (status in ('pending_payment','confirmed','cancelled','refunded'));

alter table public.event_ticket_orders
  add column if not exists payment_provider text,
  add column if not exists provider_account_id text,
  add column if not exists provider_checkout_session_id text,
  add column if not exists provider_payment_intent_id text,
  add column if not exists payment_status text not null default 'not_required',
  add column if not exists currency text not null default 'usd',
  add column if not exists ticket_subtotal_cents integer not null default 0,
  add column if not exists customer_service_fee_cents integer not null default 0,
  add column if not exists platform_fee_cents integer not null default 0,
  add column if not exists stripe_processing_estimate_cents integer not null default 0,
  add column if not exists organizer_net_estimate_cents integer not null default 0,
  add column if not exists total_cents integer not null default 0,
  add column if not exists platform_fee_bps integer not null default 0,
  add column if not exists fee_payer text,
  add column if not exists customer_fee_share_bps integer not null default 0,
  add column if not exists paid_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists disputed_at timestamptz;

alter table public.event_ticket_orders drop constraint if exists event_ticket_orders_payment_provider_check;
alter table public.event_ticket_orders add constraint event_ticket_orders_payment_provider_check
  check (payment_provider is null or payment_provider in ('stripe'));

alter table public.event_ticket_orders drop constraint if exists event_ticket_orders_payment_status_check;
alter table public.event_ticket_orders add constraint event_ticket_orders_payment_status_check
  check (payment_status in ('not_required','pending','paid','failed','expired','refunded','disputed'));

create unique index if not exists event_ticket_orders_checkout_session_unique
  on public.event_ticket_orders(provider_checkout_session_id)
  where provider_checkout_session_id is not null;

create index if not exists event_ticket_orders_payment_status_idx
  on public.event_ticket_orders(payment_status, created_at desc);
