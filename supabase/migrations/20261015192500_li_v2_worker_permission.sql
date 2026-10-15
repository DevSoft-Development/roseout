-- Each worker step is claimed atomically and rechecks operator action before work.
create or replace function public.li_v2_campaign_run_permitted(p_run_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
select exists(
 select 1 from private.li_v2_campaign_import_runs r
 join private.location_acquisition_budget_caps c on c.scope='campaign' and c.scope_id=r.campaign_id
 join private.location_acquisition_budget_caps g on g.scope='global' and g.scope_id='all'
 where r.id=p_run_id and r.status='running' and r.requested_action='run'
 and c.enabled and g.enabled and now()>=c.period_start and now()<c.period_end
 and now()>=g.period_start and now()<g.period_end
);
$$;
revoke all on function public.li_v2_campaign_run_permitted(uuid) from public,anon,authenticated;
grant execute on function public.li_v2_campaign_run_permitted(uuid) to service_role;
