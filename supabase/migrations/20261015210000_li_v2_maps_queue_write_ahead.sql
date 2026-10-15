-- A durable write-ahead queue for DataForSEO Standard tasks.
-- No automatic retry of an uncertain billable POST.
create table if not exists private.li_v2_maps_queue (
  id uuid primary key default gen_random_uuid(),
  campaign_run_id uuid not null references private.li_v2_campaign_import_runs(id),
  target_index integer not null check(target_index >= 0),
  search_query text not null,
  task_id text,
  status text not null default 'prepared'
    check (status in ('prepared','submitting','pending','ready','failed','uncertain','reviewed')),
  error_message text,
  submitted_at timestamptz,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(campaign_run_id,target_index),
  unique(task_id)
);
revoke all on private.li_v2_maps_queue from public,anon,authenticated;
alter table private.li_v2_maps_queue enable row level security;
create index if not exists li_v2_maps_queue_pending_idx on private.li_v2_maps_queue(status,updated_at);

create or replace function public.li_v2_maps_queue_transition(
  p_run_id uuid, p_index integer, p_query text, p_from text, p_to text,
  p_task_id text default null, p_error text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v private.li_v2_maps_queue%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_index < 0 or length(trim(p_query)) < 4 or length(p_query) > 160 then raise exception 'invalid_maps_target'; end if;
 if p_to not in ('prepared','submitting','pending','ready','failed','uncertain','reviewed') then raise exception 'invalid_maps_transition'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 if not exists(select 1 from private.li_v2_campaign_import_runs r where r.id=p_run_id and r.requested_action='run')
 then raise exception 'maps_queue_run_not_authorized'; end if;
 insert into private.li_v2_maps_queue(campaign_run_id,target_index,search_query)
 values(p_run_id,p_index,p_query) on conflict(campaign_run_id,target_index) do nothing;
 select * into v from private.li_v2_maps_queue where campaign_run_id=p_run_id and target_index=p_index for update;
 if v.search_query <> p_query then raise exception 'maps_queue_query_changed'; end if;
 if p_from is not null and v.status <> p_from then
   return jsonb_build_object('changed',false,'status',v.status,'task_id',v.task_id);
 end if;
 if (v.status='prepared' and p_to <> 'submitting')
  or (v.status='submitting' and p_to not in ('pending','uncertain'))
  or (v.status='pending' and p_to not in ('pending','ready','uncertain','failed'))
  or (v.status='ready' and p_to <> 'reviewed')
  or (v.status in ('uncertain','failed','reviewed'))
 then return jsonb_build_object('changed',false,'status',v.status,'task_id',v.task_id); end if;
 if p_to='pending' and (p_task_id is null or p_task_id !~ '^[0-9a-fA-F-]{36}$')
 then raise exception 'maps_queue_task_id_required'; end if;
 update private.li_v2_maps_queue set status=p_to, task_id=coalesce(p_task_id,task_id),
   error_message=p_error, submitted_at=case when p_to='pending' then now() else submitted_at end,
   checked_at=case when p_to in ('pending','ready','failed') then now() else checked_at end,
   updated_at=now()
 where id=v.id;
 return jsonb_build_object('changed',true,'status',p_to,'task_id',coalesce(p_task_id,v.task_id));
end;$$;
revoke all on function public.li_v2_maps_queue_transition(uuid,integer,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.li_v2_maps_queue_transition(uuid,integer,text,text,text,text,text) to service_role;

create or replace function public.li_v2_maps_queue_snapshot(p_run_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(jsonb_build_object('target_index',target_index,'query',search_query,
 'task_id',task_id,'status',status,'updated_at',updated_at) order by target_index),'[]'::jsonb)
from private.li_v2_maps_queue where campaign_run_id=p_run_id and auth.role()='service_role';
$$;
revoke all on function public.li_v2_maps_queue_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.li_v2_maps_queue_snapshot(uuid) to service_role;

-- Standard Queue is separately priced: do not under-reserve Business Listings Live.
alter table private.li_v2_provider_price_limits drop constraint if exists li_v2_provider_price_limits_provider_check;
alter table private.li_v2_provider_price_limits add constraint li_v2_provider_price_limits_provider_check
check(provider in ('dataforseo','dataforseo_maps_standard','brave','serpapi','google'));
insert into private.li_v2_provider_price_limits(provider,max_usd_per_request,enabled)
values('dataforseo_maps_standard',0.000600,false)
on conflict(provider) do update set max_usd_per_request=0.000600,enabled=false,updated_at=now();
update private.li_v2_provider_price_limits set enabled=false,updated_at=now()
where provider='dataforseo';

-- After a queued provider task is submitted, release the run for later polling.
-- A failed/uncertain submission remains quarantined, not resubmitted.
create or replace function public.li_v2_maps_campaign_yield(p_run_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 update private.li_v2_campaign_import_runs
 set status='queued',updated_at=now()
 where id=p_run_id and status='running' and requested_action='run'
 and exists(select 1 from private.li_v2_maps_queue q
            where q.campaign_run_id=p_run_id and q.status in ('pending','ready'));
 get diagnostics changed = row_count;
 return changed=1;
end;$$;
revoke all on function public.li_v2_maps_campaign_yield(uuid) from public,anon,authenticated;
grant execute on function public.li_v2_maps_campaign_yield(uuid) to service_role;

-- Service-only campaign financial certification. Reserved and invoiced cost are
-- deliberately separate; unreconciled charges must not be reported as final.
create or replace function public.li_v2_campaign_financial_snapshot(p_campaign_id text)
returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'campaign_id',p_campaign_id,
 'reserved_usd',coalesce(sum(estimated_usd),0),
 'actual_usd',coalesce(sum(actual_usd) filter(where status='reconciled'),0),
 'unreconciled_count',count(*) filter(where status not in ('reconciled','void')),
 'tasks_reserved',count(*) filter(where provider='dataforseo_maps_standard')
)
from private.location_acquisition_usage
where campaign_id=p_campaign_id and auth.role()='service_role'
$$;
revoke all on function public.li_v2_campaign_financial_snapshot(text) from public,anon,authenticated;
grant execute on function public.li_v2_campaign_financial_snapshot(text) to service_role;

-- Admin controls retain exact-SKU ceiling, preventing a value intended for
-- Standard Queue from being reused for Business Listings Live.
create or replace function public.admin_li_v2_set_provider_price(
 p_provider text,p_max_usd numeric,p_enabled boolean
) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_provider not in ('dataforseo','dataforseo_maps_standard','brave','serpapi','google')
    or p_max_usd is null or p_max_usd <= 0
    or (p_provider='dataforseo_maps_standard' and p_max_usd <> 0.000600)
 then raise exception 'invalid_provider_price'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 insert into private.li_v2_provider_price_limits(provider,max_usd_per_request,enabled,updated_at)
 values(p_provider,p_max_usd,p_enabled,now())
 on conflict(provider) do update set max_usd_per_request=excluded.max_usd_per_request,
 enabled=excluded.enabled,updated_at=now();
 return true;
end;$$;
revoke all on function public.admin_li_v2_set_provider_price(text,numeric,boolean)
 from public,anon,authenticated;
grant execute on function public.admin_li_v2_set_provider_price(text,numeric,boolean) to service_role;

-- Reclaim a crashed worker ONLY when the provider task id is durably saved.
-- Every other expired lease remains failed/manual reconciliation; never repost.
create or replace function public.li_v2_claim_campaign_run()
returns jsonb language plpgsql security definer set search_path='' as $$
declare v record;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 update private.li_v2_campaign_import_runs r
 set status='queued',last_error='pending_provider_task_recovered_from_expired_worker_lease',
     updated_at=now()
 where r.status='running' and r.requested_action='run'
   and r.updated_at < now()-interval '30 minutes'
   and exists(select 1 from private.li_v2_maps_queue q
     where q.campaign_run_id=r.id and q.status='pending' and q.task_id is not null);
 update private.li_v2_campaign_import_runs r
 set status='failed',last_error='worker_lease_expired_manual_reconciliation_required',
     finished_at=now(),updated_at=now()
 where r.status='running' and r.updated_at < now()-interval '30 minutes';
 select r.* into v from private.li_v2_campaign_import_runs r
 where r.status='queued' and r.requested_action='run'
 and exists(select 1 from private.location_acquisition_budget_caps c
   where c.scope='campaign' and c.scope_id=r.campaign_id and c.enabled
   and now()>=c.period_start and now()<c.period_end)
 and exists(select 1 from private.location_acquisition_budget_caps g
   where g.scope='global' and g.scope_id='all' and g.enabled
   and now()>=g.period_start and now()<g.period_end)
 order by r.created_at for update skip locked limit 1;
 if not found then return null; end if;
 update private.li_v2_campaign_import_runs
 set status='running',started_at=coalesce(started_at,now()),updated_at=now()
 where id=v.id;
 return jsonb_build_object('id',v.id,'campaign_id',v.campaign_id,'processed',v.processed);
end;$$;
revoke all on function public.li_v2_claim_campaign_run() from public,anon,authenticated;
grant execute on function public.li_v2_claim_campaign_run() to service_role;
