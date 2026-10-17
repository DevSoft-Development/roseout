-- Explicit, single V3 analysis of an existing READY task; preserves recovery_count.
create table if not exists private.li_v2_paid_task_reprocess_authorizations(
 run_id uuid primary key references private.li_v2_campaign_import_runs(id),
 revision text not null default 'verification_v3',
 authorized_at timestamptz not null default now(),
 constraint v3_revision_only check(revision='verification_v3')
);
revoke all on private.li_v2_paid_task_reprocess_authorizations from public,anon,authenticated;
create or replace function public.admin_li_v2_reprocess_paid_task_v3(p_run_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v private.li_v2_campaign_import_runs%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into v from private.li_v2_campaign_import_runs where id=p_run_id for update;
 if not found or v.status<>'failed' or v.requested_action<>'run'
    or v.last_error<>'no_published_locations_to_certify'
    or v.processed<>0 or v.recovery_count<>2 then
    raise exception 'paid_reprocessing_not_eligible';
 end if;
 if (select count(*) from private.li_v2_maps_queue q where q.campaign_run_id=p_run_id)<>1
    or not exists (select 1 from private.li_v2_maps_queue q
       where q.campaign_run_id=p_run_id and q.target_index=0
       and q.status='ready' and q.task_id is not null) then
    raise exception 'existing_paid_task_required';
 end if;
 if exists(select 1 from public.location_import_batches b
    where b.source='li_v2_independent' and b.metadata->>'run_id'=p_run_id::text
    and b.status in ('published','publishing')) then
    raise exception 'already_published_no_replay';
 end if;
 if not exists(select 1 from private.location_acquisition_budget_caps c
   where c.scope='campaign' and c.scope_id=v.campaign_id and c.enabled
    and now()>=c.period_start and now()<c.period_end)
  or not exists(select 1 from private.location_acquisition_budget_caps c
   where c.scope='global' and c.scope_id='all' and c.enabled
    and now()>=c.period_start and now()<c.period_end) then
   raise exception 'budget_disabled';
 end if;
 insert into private.li_v2_paid_task_reprocess_authorizations(run_id) values(p_run_id);
 update private.li_v2_campaign_import_runs
 set status='queued',last_error=null,finished_at=null,updated_at=now()
 where id=p_run_id;
 return true;
end;$$;
revoke all on function public.admin_li_v2_reprocess_paid_task_v3(uuid) from public,anon,authenticated;
grant execute on function public.admin_li_v2_reprocess_paid_task_v3(uuid) to service_role;
