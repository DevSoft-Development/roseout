-- CI-only operational POS contract fixture. Not used for production migrations.
-- Supabase app migrations don't provision the dedicated operational shards.
begin;
create table if not exists public.locations (id uuid primary key);
create table if not exists public.pos_checks (
 id uuid primary key, location_id uuid not null references public.locations(id),
 currency text not null default 'usd', status text not null default 'open',
 subtotal_cents integer not null default 0, discount_cents integer not null default 0,
 tax_cents integer not null default 0, service_charge_cents integer not null default 0,
 total_cents integer not null default 0, amount_paid_cents integer not null default 0,
 amount_refunded_cents integer not null default 0,
 closed_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.pos_tenders (
 id uuid primary key, location_id uuid not null references public.locations(id),
 check_id uuid not null references public.pos_checks(id),
 tender_type text not null default 'card', status text not null default 'initiated',
 amount_cents integer not null default 0, tip_cents integer not null default 0,
 total_cents integer not null default 0, amount_refunded_cents integer not null default 0,
 completed_at timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.pos_order_items (
 id uuid primary key, location_id uuid not null references public.locations(id),
 check_id uuid not null references public.pos_checks(id),
 item_name text, quantity integer, unit_price_cents integer,
 unit_modifier_total_cents integer, discount_cents integer, status text
);
create table if not exists public.pos_payments (
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references public.locations(id),
 check_id uuid not null references public.pos_checks(id),
 tender_id uuid not null references public.pos_tenders(id),
 provider text, provider_payment_intent_id text, connected_account_id text,
 idempotency_key text, status text, amount_cents integer,
 tip_cents integer, application_fee_cents integer, payment_method_type text,
 processed_at timestamptz, succeeded_at timestamptz,
 metadata jsonb default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.pos_evidence_customer_sessions (
 nonce uuid primary key, location_id uuid not null references public.locations(id),
 check_id uuid not null references public.pos_checks(id),
 tender_id uuid not null references public.pos_tenders(id),
 device_id text not null, expires_at timestamptz not null,
 consumed_at timestamptz, created_at timestamptz not null default now()
);
commit;
