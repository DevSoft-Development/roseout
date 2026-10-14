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

-- Service-only idempotent metering writer; authenticated users cannot call this API.
create or replace function public.record_location_acquisition_usage(
 p_event_key text, p_provider text, p_operation text, p_status text, p_estimated_usd numeric,
 p_campaign_id text default null, p_run_id text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
 insert into private.location_acquisition_usage
 (event_key, provider, operation, status, estimated_usd, campaign_id, run_id)
 values (p_event_key,p_provider,p_operation,p_status,p_estimated_usd,p_campaign_id,p_run_id)
 on conflict (event_key) do nothing;
end $$;
revoke all on function public.record_location_acquisition_usage(text,text,text,text,numeric,text,text) from public, anon, authenticated;
grant execute on function public.record_location_acquisition_usage(text,text,text,text,numeric,text,text) to service_role;

-- Caps are disabled until explicitly configured by operators.
create table if not exists private.location_acquisition_budget_caps (
 scope text not null check (scope in ('global','provider','campaign','run')),
 scope_id text not null,
 period_start timestamptz not null,
 period_end timestamptz not null,
 cap_usd numeric(16,6) not null check (cap_usd >= 0),
 enabled boolean not null default false,
 primary key(scope,scope_id,period_start),
 check (period_end > period_start)
);
revoke all on private.location_acquisition_budget_caps from public,anon,authenticated;

-- Serialize all acquisition reservations to prevent parallel overspend.
create or replace function public.reserve_location_acquisition_spend(
 p_event_key text, p_provider text, p_operation text, p_estimated_usd numeric,
 p_campaign_id text default null, p_run_id text default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare cap record;
declare usage_usd numeric;
declare identifier text;
begin
 if p_estimated_usd is null or p_estimated_usd <= 0 or p_provider is null or p_event_key is null then
   raise exception 'invalid_acquisition_reservation';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 -- No active global budget means acquisitions are not authorized.
 if not exists (select 1 from private.location_acquisition_budget_caps where scope = 'global' and scope_id = 'all' and enabled and pg_catalog.now() >= period_start and pg_catalog.now() < period_end) then return false; end if;
 if exists(select 1 from private.location_acquisition_usage where event_key=p_event_key) then return false; end if;
 for cap in select * from private.location_acquisition_budget_caps c where c.enabled
 and pg_catalog.now() >= c.period_start and pg_catalog.now() < c.period_end
 and ((c.scope='global' and c.scope_id='all') or
 (c.scope='provider' and c.scope_id=p_provider) or
 (c.scope='campaign' and c.scope_id=p_campaign_id) or
 (c.scope='run' and c.scope_id=p_run_id))
 loop
 select coalesce(sum(estimated_usd),0) into usage_usd
 from private.location_acquisition_usage u
 where u.occurred_at >= cap.period_start and u.occurred_at < cap.period_end
 and u.status not in ('void')
 and ((cap.scope='global') or (cap.scope='provider' and u.provider=p_provider)
 or (cap.scope='campaign' and u.campaign_id=p_campaign_id)
 or (cap.scope='run' and u.run_id=p_run_id));
 if usage_usd + p_estimated_usd > cap.cap_usd then return false; end if;
 end loop;
 insert into private.location_acquisition_usage
 (event_key,provider,operation,estimated_usd,status,campaign_id,run_id)
 values(p_event_key,p_provider,p_operation,p_estimated_usd,'estimated',p_campaign_id,p_run_id);
 return true;
end $$;
revoke all on function public.reserve_location_acquisition_spend(text,text,text,numeric,text,text) from public,anon,authenticated;
grant execute on function public.reserve_location_acquisition_spend(text,text,text,numeric,text,text) to service_role;

-- Service-only aggregated report. Null actuals are never treated as settled invoices.
create or replace function public.get_location_acquisition_provider_spend()
returns table(provider text, attempts bigint, estimated_usd numeric, reconciled_usd numeric, credits_usd numeric)
language sql security definer set search_path = '' stable as $$
 select u.provider, count(*)::bigint,
 coalesce(sum(u.estimated_usd),0)::numeric,
 coalesce(sum(u.actual_usd) filter (where u.status='reconciled'),0)::numeric,
 coalesce(sum(u.credit_usd),0)::numeric
 from private.location_acquisition_usage u
 group by u.provider order by u.provider
$$;
revoke all on function public.get_location_acquisition_provider_spend() from public,anon,authenticated;
grant execute on function public.get_location_acquisition_provider_spend() to service_role;
