-- Recover a stale RUNNING LI V2 campaign only when every durable paid target
-- has already reached reviewed and is included in the processed checkpoint.
-- Ambiguous / unfinished provider tasks remain quarantined for reconciliation.
create table if not exists private.li_v2_stale_reviewed_reclaim_audit (
 run_id uuid primary key,
 prior_processed integer not null,
 prior_failed integer not null,
 reviewed_targets integer not null,
 recovered_at timestamptz not null default now(),
 reason text not null default 'stale_running_all_paid_targets_reviewed'
);
revoke all on private.li_v2_stale_reviewed_reclaim_audit from public,anon,authenticated;

create or replace function public.li_v2_claim_campaign_run()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 -- Correct publication accounting and release only *fully checkpointed*
 -- stale work. A reviewed target at index >= processed still requires an
 -- ordinary worker checkpoint, so it is deliberately not recovered here.
 with safe as (
   select r.id,r.processed,r.failed,
     (select count(*)::integer from private.li_v2_maps_queue q where q.campaign_run_id=r.id) as reviewed_count
   from private.li_v2_campaign_import_runs r
   where r.status='running' and r.requested_action='run'
     and r.updated_at < now()-interval '30 minutes' and r.processed>0
     and exists(select 1 from private.li_v2_maps_queue q
       where q.campaign_run_id=r.id and q.status='reviewed'
         and q.target_index=r.processed-1)
     and not exists(select 1 from private.li_v2_maps_queue q
       where q.campaign_run_id=r.id and
         (q.status <> 'reviewed' or q.target_index >= r.processed))
 ), evidence as (
   insert into private.li_v2_stale_reviewed_reclaim_audit
     (run_id,prior_processed,prior_failed,reviewed_targets)
   select id,processed,failed,reviewed_count from safe
   on conflict (run_id) do nothing
   returning run_id
 )
 update private.li_v2_campaign_import_runs r
 set status='queued',updated_at=now(),
     published=greatest(r.published,(
       select count(distinct c.location_id)::integer
       from private.li_v2_consumer_retrieval_checks c
       join public.locations l on l.id=c.location_id
       where c.run_id=r.id and l.import_source='li_v2_independent'
         and l.is_searchable=true and l.publish_ready=true
         and l.quality_status='publish_ready' and l.active=true
         and l.is_hidden=false and l.deleted_at is null
         and l.has_photos=true and l.duplicate_status='unique'
     ))
 where r.id in (select run_id from evidence);
 -- Preserve the conservative failure behavior for every ambiguous stale run.
 update private.li_v2_campaign_import_runs r
 set status='failed',last_error='worker_lease_expired_manual_reconciliation_required',
   finished_at=now(),updated_at=now()
 where r.status='running' and r.updated_at<now()-interval '30 minutes';
 select r.* into v from private.li_v2_campaign_import_runs r
 where r.status='queued' and r.requested_action='run'
 and exists(select 1 from private.location_acquisition_budget_caps c
   where c.scope='campaign' and c.scope_id=r.campaign_id
     and c.enabled and now()>=c.period_start and now()<c.period_end)
 and exists(select 1 from private.location_acquisition_budget_caps g
   where g.scope='global' and g.scope_id='all'
     and g.enabled and now()>=g.period_start and now()<g.period_end)
 order by r.created_at for update skip locked limit 1;
 if not found then return null; end if;
 update private.li_v2_campaign_import_runs
 set status='running',started_at=coalesce(started_at,now()),updated_at=now()
 where id=v.id;
 return jsonb_build_object('id',v.id,'campaign_id',v.campaign_id,'processed',v.processed);
end;$$;
revoke all on function public.li_v2_claim_campaign_run() from public,anon,authenticated;
grant execute on function public.li_v2_claim_campaign_run() to service_role;
