-- One additional explicit operator-authorized analysis of an already paid task.
-- Never submit a new task, reset dedupe state, or release any photo/identity gate.
alter table private.li_v2_campaign_import_runs
 drop constraint if exists li_v2_campaign_import_runs_recovery_count_check;
alter table private.li_v2_campaign_import_runs
 add constraint li_v2_campaign_import_runs_recovery_count_check
 check(recovery_count between 0 and 2);

create or replace function public.admin_li_v2_reverify_existing_paid_task(p_run_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v private.li_v2_campaign_import_runs%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into v from private.li_v2_campaign_import_runs where id=p_run_id for update;
 if not found or v.status <> 'failed' or v.requested_action <> 'run'
  or v.last_error <> 'no_published_locations_to_certify'
  or v.processed <> 0 or v.recovery_count <> 1 then
   raise exception 'paid_reverification_not_eligible';
 end if;
 if (select count(*) from private.li_v2_maps_queue q where q.campaign_run_id=p_run_id) <> 1
  or not exists(select 1 from private.li_v2_maps_queue q
     where q.campaign_run_id=p_run_id and q.target_index=0
       and q.status='ready' and q.task_id is not null) then
   raise exception 'reverification_requires_existing_ready_task';
 end if;
 if exists(select 1 from public.location_import_batches b
     where b.source='li_v2_independent'
       and b.metadata->>'run_id'=p_run_id::text
       and b.status in ('publishing','published')) then
   raise exception 'reverification_published_batch_present';
 end if;
 if not exists(select 1 from private.location_acquisition_budget_caps c
     where c.scope='campaign' and c.scope_id=v.campaign_id and c.enabled
       and now()>=c.period_start and now()<c.period_end)
   or not exists(select 1 from private.location_acquisition_budget_caps c
     where c.scope='global' and c.scope_id='all' and c.enabled
       and now()>=c.period_start and now()<c.period_end) then
   raise exception 'reverification_budget_disabled';
 end if;
 update private.li_v2_campaign_import_runs set status='queued',
  last_error=null,finished_at=null,recovery_count=2,updated_at=now()
 where id=p_run_id;
 return true;
end;$$;
revoke all on function public.admin_li_v2_reverify_existing_paid_task(uuid) from public,anon,authenticated;
grant execute on function public.admin_li_v2_reverify_existing_paid_task(uuid) to service_role;
