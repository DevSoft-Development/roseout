-- One Admin-owned control plane for paid acquisition campaigns and price estimates.
create table if not exists private.li_v2_provider_price_limits(
 provider text primary key check(provider in ('dataforseo','brave','serpapi','google')),
 max_usd_per_request numeric(16,6) not null check(max_usd_per_request>0),
 enabled boolean not null default false,
 updated_at timestamptz not null default now()
);
insert into private.li_v2_provider_price_limits(provider,max_usd_per_request,enabled)
values('dataforseo',0.048,false),('brave',0.005,false)
on conflict (provider) do nothing;

create or replace function public.li_v2_acquisition_controls_snapshot()
returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('providers',coalesce((
 select jsonb_agg(jsonb_build_object('provider',provider,'max_usd_per_request',max_usd_per_request,'enabled',enabled) order by provider)
 from private.li_v2_provider_price_limits),'[]'::jsonb));
$$;
revoke all on function public.li_v2_acquisition_controls_snapshot() from public,anon,authenticated;
grant execute on function public.li_v2_acquisition_controls_snapshot() to service_role;

create or replace function public.admin_li_v2_set_provider_price(p_provider text,p_max_usd numeric,p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_provider not in ('dataforseo','brave','serpapi','google') or p_max_usd is null or p_max_usd <= 0
 then raise exception 'invalid_provider_price'; end if;
 perform pg_advisory_xact_lock(6742031);
 insert into private.li_v2_provider_price_limits(provider,max_usd_per_request,enabled,updated_at)
 values (p_provider,p_max_usd,p_enabled,now())
 on conflict(provider) do update set max_usd_per_request=excluded.max_usd_per_request,
 enabled=excluded.enabled,updated_at=now();
 return true;
end;$$;
revoke all on function public.admin_li_v2_set_provider_price(text,numeric,boolean) from public,anon,authenticated;
grant execute on function public.admin_li_v2_set_provider_price(text,numeric,boolean) to service_role;

create or replace function public.li_v2_paid_acquisition_preflight(p_campaign_id text,p_provider text,p_price_usd numeric)
returns boolean language sql stable security definer set search_path='' as $$
select coalesce((select c.enabled and c.cap_usd > 0
 from private.location_acquisition_budget_caps c where c.scope='campaign' and c.scope_id=p_campaign_id
 and now()>=c.period_start and now()<c.period_end),false)
and exists(select 1 from private.location_acquisition_budget_caps g
 where g.scope='global' and g.scope_id='all' and g.enabled and now()>=g.period_start and now()<g.period_end)
and exists(select 1 from private.li_v2_provider_price_limits p
 where p.provider=p_provider and p.enabled and p.max_usd_per_request>=p_price_usd and p_price_usd>0);
$$;
revoke all on function public.li_v2_paid_acquisition_preflight(text,text,numeric) from public,anon,authenticated;
grant execute on function public.li_v2_paid_acquisition_preflight(text,text,numeric) to service_role;
