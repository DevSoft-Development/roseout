-- POS V1 core transactional model.
-- Reuses canonical TheOutHaven location, Reserve reservation/staff, and floor-layout resources.
-- Provider-specific payment payloads remain outside the core check/order model.

create extension if not exists pgcrypto;

create table if not exists public.pos_checks (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  reservation_id uuid null references public.location_reservations(id) on delete set null,
  server_staff_profile_id uuid null references public.reserve_staff_profiles(id) on delete set null,
  status text not null default 'open'
    check (status in ('open','held','closed','voided')),
  guest_count integer not null default 1 check (guest_count > 0),
  currency text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  tax_cents integer not null default 0 check (tax_cents >= 0),
  service_charge_cents integer not null default 0 check (service_charge_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  amount_paid_cents integer not null default 0 check (amount_paid_cents >= 0),
  amount_refunded_cents integer not null default 0 check (amount_refunded_cents >= 0),
  tip_cents integer not null default 0 check (tip_cents >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  voided_at timestamptz null,
  notes text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    total_cents = greatest(
      0,
      subtotal_cents - discount_cents + tax_cents + service_charge_cents
    )
  ),
  check (
    (status = 'closed' and closed_at is not null)
    or status <> 'closed'
  ),
  check (
    (status = 'voided' and voided_at is not null)
    or status <> 'voided'
  )
);

create index if not exists pos_checks_location_status_idx
  on public.pos_checks(location_id, status, opened_at desc);
create index if not exists pos_checks_reservation_idx
  on public.pos_checks(reservation_id)
  where reservation_id is not null;
create index if not exists pos_checks_server_idx
  on public.pos_checks(location_id, server_staff_profile_id, opened_at desc)
  where server_staff_profile_id is not null;

create table if not exists public.pos_check_resources (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  location_id uuid not null references public.locations(id) on delete cascade,
  layout_item_id uuid null references public.layout_items(id) on delete set null,
  seating_resource_id uuid null references public.reservation_seating_resources(id) on delete set null,
  resource_label text null,
  created_at timestamptz not null default now(),
  check (
    (layout_item_id is not null and seating_resource_id is null)
    or (layout_item_id is null and seating_resource_id is not null)
  )
);

create unique index if not exists pos_check_resources_layout_uidx
  on public.pos_check_resources(check_id, layout_item_id)
  where layout_item_id is not null;
create unique index if not exists pos_check_resources_seat_uidx
  on public.pos_check_resources(check_id, seating_resource_id)
  where seating_resource_id is not null;
create index if not exists pos_check_resources_location_idx
  on public.pos_check_resources(location_id, check_id);

create table if not exists public.pos_orders (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  server_staff_profile_id uuid null references public.reserve_staff_profiles(id) on delete set null,
  status text not null default 'draft'
    check (status in ('draft','sent','fired','fulfilled','voided')),
  course_name text null,
  notes text null,
  sent_at timestamptz null,
  fired_at timestamptz null,
  fulfilled_at timestamptz null,
  voided_at timestamptz null,
  void_reason text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_orders_check_idx
  on public.pos_orders(check_id, created_at);
create index if not exists pos_orders_location_status_idx
  on public.pos_orders(location_id, status, created_at desc);

create table if not exists public.pos_order_items (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  order_id uuid not null references public.pos_orders(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  catalog_item_id uuid null,
  item_name text not null,
  seat_number integer null check (seat_number is null or seat_number > 0),
  quantity integer not null default 1 check (quantity > 0),
  unit_price_cents integer not null default 0 check (unit_price_cents >= 0),
  unit_modifier_total_cents integer not null default 0 check (unit_modifier_total_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  line_total_cents integer generated always as (
    greatest(
      0,
      quantity * (unit_price_cents + unit_modifier_total_cents) - discount_cents
    )
  ) stored,
  modifiers jsonb not null default '[]'::jsonb,
  notes text null,
  status text not null default 'active'
    check (status in ('active','sent','fired','fulfilled','voided')),
  void_reason text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pos_order_items_order_idx
  on public.pos_order_items(order_id, created_at);
create index if not exists pos_order_items_check_idx
  on public.pos_order_items(check_id, created_at);
create index if not exists pos_order_items_location_status_idx
  on public.pos_order_items(location_id, status, created_at desc);

create table if not exists public.pos_tenders (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  staff_profile_id uuid null references public.reserve_staff_profiles(id) on delete set null,
  tender_number integer not null check (tender_number > 0),
  tender_type text not null
    check (tender_type in ('cash','card','gift_card','other')),
  status text not null default 'initiated'
    check (status in ('initiated','completed','voided','partially_refunded','refunded')),
  amount_cents integer not null check (amount_cents > 0),
  tip_cents integer not null default 0 check (tip_cents >= 0),
  total_cents integer generated always as (amount_cents + tip_cents) stored,
  amount_refunded_cents integer not null default 0 check (amount_refunded_cents >= 0),
  cash_received_cents integer null check (cash_received_cents is null or cash_received_cents >= 0),
  cash_change_cents integer null check (cash_change_cents is null or cash_change_cents >= 0),
  completed_at timestamptz null,
  voided_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(check_id, tender_number),
  check (
    (tender_type = 'cash' and cash_received_cents is not null)
    or tender_type <> 'cash'
  )
);

create index if not exists pos_tenders_check_idx
  on public.pos_tenders(check_id, tender_number);
create index if not exists pos_tenders_location_status_idx
  on public.pos_tenders(location_id, status, created_at desc);

create table if not exists public.pos_payments (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  tender_id uuid not null references public.pos_tenders(id) on delete cascade,
  provider text not null,
  provider_payment_intent_id text not null,
  connected_account_id text null,
  idempotency_key text not null,
  status text not null default 'created'
    check (status in (
      'created',
      'requires_payment_method',
      'requires_confirmation',
      'requires_action',
      'processing',
      'requires_capture',
      'succeeded',
      'failed',
      'canceled',
      'partially_refunded',
      'refunded'
    )),
  amount_cents integer not null check (amount_cents > 0),
  tip_cents integer not null default 0 check (tip_cents >= 0),
  application_fee_cents integer not null default 0 check (application_fee_cents >= 0),
  payment_method_type text null,
  failure_code text null,
  failure_message text null,
  processed_at timestamptz null,
  succeeded_at timestamptz null,
  canceled_at timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(provider, provider_payment_intent_id),
  unique(location_id, provider, idempotency_key),
  check (application_fee_cents <= amount_cents)
);

create index if not exists pos_payments_check_idx
  on public.pos_payments(check_id, created_at);
create index if not exists pos_payments_tender_idx
  on public.pos_payments(tender_id, created_at);
create index if not exists pos_payments_location_status_idx
  on public.pos_payments(location_id, status, created_at desc);

alter table public.pos_checks enable row level security;
alter table public.pos_check_resources enable row level security;
alter table public.pos_orders enable row level security;
alter table public.pos_order_items enable row level security;
alter table public.pos_tenders enable row level security;
alter table public.pos_payments enable row level security;

revoke all on table public.pos_checks from anon, authenticated;
revoke all on table public.pos_check_resources from anon, authenticated;
revoke all on table public.pos_orders from anon, authenticated;
revoke all on table public.pos_order_items from anon, authenticated;
revoke all on table public.pos_tenders from anon, authenticated;
revoke all on table public.pos_payments from anon, authenticated;

grant select, insert, update, delete on table public.pos_checks to service_role;
grant select, insert, update, delete on table public.pos_check_resources to service_role;
grant select, insert, update, delete on table public.pos_orders to service_role;
grant select, insert, update, delete on table public.pos_order_items to service_role;
grant select, insert, update, delete on table public.pos_tenders to service_role;
grant select, insert, update, delete on table public.pos_payments to service_role;

-- Keep POS operational state inside the existing Virginia -> Oregon DR publication.
do $dr$
declare
  table_name text;
begin
  if exists (select 1 from pg_publication where pubname = 'theouthaven_dr_publication') then
    foreach table_name in array array[
      'pos_checks',
      'pos_check_resources',
      'pos_orders',
      'pos_order_items',
      'pos_tenders',
      'pos_payments'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'theouthaven_dr_publication'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format(
          'alter publication theouthaven_dr_publication add table public.%I',
          table_name
        );
      end if;
    end loop;
  end if;
end
$dr$;
