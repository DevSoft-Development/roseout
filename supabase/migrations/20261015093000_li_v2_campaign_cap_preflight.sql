-- Campaign activation preflight; budget reservation remains authoritative and atomic.
create or replace function public.is_location_acquisition_campaign_active(p_campaign_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from private.location_acquisition_budget_caps c
    where c.scope = 'campaign'
      and c.scope_id = p_campaign_id
      and c.enabled
      and pg_catalog.now() >= c.period_start
      and pg_catalog.now() < c.period_end
      and c.cap_usd > 0
  );
$$;
revoke all on function public.is_location_acquisition_campaign_active(text) from public, anon, authenticated;
grant execute on function public.is_location_acquisition_campaign_active(text) to service_role;
