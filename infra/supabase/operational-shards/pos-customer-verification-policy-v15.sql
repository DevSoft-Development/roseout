-- Optional customer-controlled QR acknowledgment policy.
-- Schema only. No payment activation or shard-routing changes.
begin;
create table if not exists public.pos_customer_verification_policies(
 location_id uuid primary key references public.locations(id) on delete cascade,
 enabled boolean not null default false,
 qr_threshold_cents integer not null default 100000 check(qr_threshold_cents>=100),
 customer_screen_threshold_cents integer not null default 25000 check(customer_screen_threshold_cents>=100),
 updated_at timestamptz not null default now(),
 constraint pos_verification_threshold_order check(qr_threshold_cents>=customer_screen_threshold_cents)
);
alter table public.pos_customer_verification_policies enable row level security;
revoke all on table public.pos_customer_verification_policies from public,anon,authenticated;
grant select,insert,update on table public.pos_customer_verification_policies to service_role;
commit;
