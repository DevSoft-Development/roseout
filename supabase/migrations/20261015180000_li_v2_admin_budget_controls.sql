-- Authorized via isolated Admin server only; API exposes service-role-only RPC.
create or replace function public.admin_li_v2_budget_snapshot()
returns jsonb language sql stable security definer set search_path='' as $$
select pg_catalog.jsonb_build_object(
 'caps', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
  'scope',c.scope,'scope_id',c.scope_id,'cap_usd',c.cap_usd,'enabled',c.enabled,
  'period_start',c.period_start,'period_end',c.period_end,
  'used_usd',(select coalesce(sum(u.estimated_usd),0) from private.location_acquisition_usage u
    where u.status <> 'void' and u.occurred_at >= c.period_start and u.occurred_at < c.period_end
    and (c.scope='global' or (c.scope='campaign' and u.campaign_id=c.scope_id))
  )) order by c.scope,c.scope_id) from private.location_acquisition_budget_caps c
  where pg_catalog.now() >= c.period_start and pg_catalog.now() < c.period_end),'[]'::jsonb)
);
$$;
revoke all on function public.admin_li_v2_budget_snapshot() from public,anon,authenticated;
grant execute on function public.admin_li_v2_budget_snapshot() to service_role;

create or replace function public.admin_li_v2_update_budget(
 p_scope text, p_scope_id text, p_cap_usd numeric, p_enabled boolean)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_cap private.location_acquisition_budget_caps%rowtype;
declare v_used numeric;
declare v_global boolean;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'service_role_required';
 end if;
 if p_scope not in ('global','campaign') or
    (p_scope='global' and p_scope_id <> 'all') or
    (p_scope='campaign' and p_scope_id !~ '^[a-zA-Z0-9:_-]{6,100}$') or
    p_cap_usd is null or p_cap_usd < 0 or p_cap_usd > 10000 then
   raise exception 'invalid_budget_input';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into v_cap from private.location_acquisition_budget_caps c
 where c.scope=p_scope and c.scope_id=p_scope_id
 and pg_catalog.now() >= c.period_start and pg_catalog.now() < c.period_end;
 if not found then raise exception 'active_budget_record_not_found'; end if;
 select coalesce(sum(u.estimated_usd),0) into v_used
 from private.location_acquisition_usage u
 where u.status <> 'void' and u.occurred_at >= v_cap.period_start and u.occurred_at < v_cap.period_end
 and (p_scope='global' or u.campaign_id=p_scope_id);
 if p_cap_usd < v_used then raise exception 'budget_below_reserved_spend'; end if;
 if p_enabled and p_cap_usd <= 0 then raise exception 'enabled_budget_must_be_positive'; end if;
 if p_scope='campaign' and p_enabled then
   select exists(select 1 from private.location_acquisition_budget_caps g
     where g.scope='global' and g.scope_id='all' and g.enabled
     and pg_catalog.now() >= g.period_start and pg_catalog.now() < g.period_end)
   into v_global;
   if not v_global then raise exception 'global_budget_must_be_enabled_first'; end if;
 end if;
 update private.location_acquisition_budget_caps c
 set cap_usd=p_cap_usd,enabled=p_enabled
 where c.scope=v_cap.scope and c.scope_id=v_cap.scope_id and c.period_start=v_cap.period_start;
 return true;
end;$$;
revoke all on function public.admin_li_v2_update_budget(text,text,numeric,boolean) from public,anon,authenticated;
grant execute on function public.admin_li_v2_update_budget(text,text,numeric,boolean) to service_role;
