-- Append-only provider metering foundation. Internal service writes only.
create schema if not exists private;
create table if not exists private.location_acquisition_usage (
 id uuid primary key default gen_random_uuid(),
 event_key text not null unique,
 provider text not null,
 operation text not null,
 campaign_id text,
 run_id text,
 location_id uuid,
 quantity numeric not null default 1 check (quantity >= 0),
 estimated_usd numeric(16,6) not null default 0 check (estimated_usd >= 0),
 actual_usd numeric(16,6) check (actual_usd is null or actual_usd >= 0),
 credit_usd numeric(16,6) not null default 0 check (credit_usd >= 0),
 status text not null default 'estimated' check (status in ('estimated','reconciled','failed','void')),
 occurred_at timestamptz not null default now(),
 metadata jsonb not null default '{}'::jsonb
);
create index if not exists location_acquisition_usage_period_idx on private.location_acquisition_usage (occurred_at desc, provider);
create index if not exists location_acquisition_usage_campaign_idx on private.location_acquisition_usage (campaign_id, occurred_at desc);
revoke all on private.location_acquisition_usage from public, anon, authenticated;
create table if not exists private.location_acquisition_quality_audit (
 id uuid primary key default gen_random_uuid(),
 candidate_key text not null,
 campaign_id text,
 rule_version text not null default 'v1',
 decision text not null check (decision in ('accept','reject','quarantine','duplicate','protected')),
 reason text not null,
 created_at timestamptz not null default now()
);
create index if not exists location_acquisition_quality_audit_candidate_idx on private.location_acquisition_quality_audit (candidate_key, created_at desc);
revoke all on private.location_acquisition_quality_audit from public, anon, authenticated;
