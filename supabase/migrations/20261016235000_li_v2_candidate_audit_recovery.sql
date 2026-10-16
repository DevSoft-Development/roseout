-- Fail-closed LI V2 candidate diagnostics and single-use recovery of an already purchased task.
create table if not exists public.li_v2_candidate_audit (
 id uuid primary key default gen_random_uuid(),
 run_id uuid not null references private.li_v2_campaign_import_runs(id),
 candidate_key text not null check(length(candidate_key)=64),
 website_origin text,
 status text not null check(status in ('rejected','staged','published','pending_review')),
 reason text not null check(length(reason) between 3 and 120),
 recorded_at timestamptz not null default now(),
 unique(run_id,candidate_key)
);
create index if not exists li_v2_candidate_audit_run on public.li_v2_candidate_audit(run_id,status,reason);
alter table public.li_v2_candidate_audit enable row level security;
revoke all on public.li_v2_candidate_audit from public,anon,authenticated;
grant select,insert,update on public.li_v2_candidate_audit to service_role;
alter table private.li_v2_campaign_import_runs
 add column if not exists recovery_count integer not null default 0 check(recovery_count between 0 and 1);

-- Recovery never posts another provider task. Require the already reconciled
-- queue identity and the exact known failed outcome. The worker's bootstrap
-- target-zero boundary remains in effect on subsequent invocations.
create or replace function public.admin_li_v2_recover_paid_task(p_run_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_run private.li_v2_campaign_import_runs%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into v_run from private.li_v2_campaign_import_runs where id=p_run_id for update;
 if not found or v_run.status<>'failed'
    or v_run.last_error<>'no_published_locations_to_certify'
    or v_run.recovery_count<>0 or v_run.processed<>0 then
   raise exception 'paid_task_recovery_not_eligible';
 end if;
 if not exists(select 1 from private.li_v2_maps_queue q
   where q.campaign_run_id=p_run_id and q.target_index=0 and q.status='ready' and q.task_id is not null)
   or exists(select 1 from private.li_v2_maps_queue q
   where q.campaign_run_id=p_run_id and q.target_index<>0)
   or exists(select 1 from public.location_import_staging s
   where s.source='li_v2_independent' and s.raw_payload->>'run_id'=p_run_id::text
     and s.import_status='published') then
   raise exception 'paid_task_queue_not_replay_safe';
 end if;
 if not exists(select 1 from private.location_acquisition_budget_caps c
     where c.scope='campaign' and c.scope_id=v_run.campaign_id and c.enabled
      and now()>=c.period_start and now()<c.period_end)
   or not exists(select 1 from private.location_acquisition_budget_caps c
     where c.scope='global' and c.scope_id='all' and c.enabled
      and now()>=c.period_start and now()<c.period_end) then
   raise exception 'campaign_budget_inactive';
 end if;
 update private.li_v2_campaign_import_runs
   set status='queued',requested_action='run',last_error=null,finished_at=null,
       recovery_count=recovery_count+1,updated_at=now()
   where id=p_run_id;
 return true;
end;$$;
revoke all on function public.admin_li_v2_recover_paid_task(uuid) from public,anon,authenticated;
grant execute on function public.admin_li_v2_recover_paid_task(uuid) to service_role;

-- Admin-only consolidated read model. Private queue/ledger stay in private schema.
create or replace function public.admin_li_v2_acquisition_snapshot(p_campaign_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 return pg_catalog.jsonb_build_object(
  'campaign_id',p_campaign_id,
  'runs',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(r) order by r.created_at desc),'[]'::jsonb)
    from (select id,campaign_id,status,requested_action,processed,discovered,published,failed,last_error,recovery_count,updated_at,created_at
      from private.li_v2_campaign_import_runs where campaign_id=p_campaign_id order by created_at desc limit 20) r),
  'queue',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'run_id',q.campaign_run_id,'target_index',q.target_index,'status',q.status,
      'has_provider_task',q.task_id is not null,'updated_at',q.updated_at)),'[]'::jsonb)
     from private.li_v2_maps_queue q join private.li_v2_campaign_import_runs r on r.id=q.campaign_run_id
     where r.campaign_id=p_campaign_id),
  'spend',(select pg_catalog.jsonb_build_object(
     'estimated_usd',coalesce(sum(u.estimated_usd),0),
     'actual_usd',coalesce(sum(u.actual_usd),0),
     'unreconciled',count(*) filter(where u.status not in ('reconciled','void')))
     from private.location_acquisition_usage u where u.campaign_id=p_campaign_id),
  'rejections',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'reason',a.reason,'status',a.status,'count',a.n)),'[]'::jsonb) from (
    select d.reason,d.status,count(*) n from public.li_v2_candidate_audit d
    join private.li_v2_campaign_import_runs r on r.id=d.run_id
    where r.campaign_id=p_campaign_id group by d.reason,d.status
  ) a)
 );
end;$$;
revoke all on function public.admin_li_v2_acquisition_snapshot(text) from public,anon,authenticated;
grant execute on function public.admin_li_v2_acquisition_snapshot(text) to service_role;
