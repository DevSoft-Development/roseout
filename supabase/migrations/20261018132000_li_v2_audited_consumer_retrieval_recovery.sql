-- Bounded retry of an already paid acquisition after the consumer eligibility fix.
-- Preserve the historical count and failure evidence. This does NOT certify search.
create table if not exists private.li_v2_retrieval_recovery_audit (
  id bigserial primary key,
  run_id uuid not null,
  target_index integer not null,
  location_id uuid not null,
  prior_attempts integer not null,
  prior_error text,
  prior_status text not null,
  reason text not null,
  recorded_at timestamptz not null default now(),
  unique(run_id,target_index,location_id,prior_attempts)
);
revoke all on private.li_v2_retrieval_recovery_audit from public,anon,authenticated;
alter table private.li_v2_retrieval_recovery_audit enable row level security;

-- Retain cumulative attempts instead of resetting 8 to zero. Four more real
-- consumer probes are allowed after a one-time audited recovery.
create or replace function public.li_v2_retrieval_record(
 p_run_id uuid,p_index integer,p_location_id uuid,p_found boolean,p_error text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v private.li_v2_consumer_retrieval_checks%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 if not exists(select 1 from private.li_v2_campaign_import_runs
   where id=p_run_id and status='running' and requested_action='run') then return false; end if;
 select * into v from private.li_v2_consumer_retrieval_checks
   where run_id=p_run_id and target_index=p_index and location_id=p_location_id for update;
 if not found or v.status<>'pending' or v.next_attempt_at>now() then return false; end if;
 update private.li_v2_consumer_retrieval_checks
 set attempts=attempts+1,
     status=case when p_found then 'verified' when attempts+1>=
       (case when exists(select 1 from private.li_v2_retrieval_recovery_audit a
          where a.run_id=p_run_id and a.target_index=p_index and a.location_id=p_location_id)
          then 12 else 8 end) then 'quarantined' else 'pending' end,
     last_error=case when p_found then null else left(coalesce(p_error,'not_returned'),300) end,
     next_attempt_at=case when p_found then now() else now()+make_interval(mins=>least(30,power(2,least(attempts,4))::integer)) end,
     verified_at=case when p_found then now() else null end,updated_at=now()
 where run_id=p_run_id and target_index=p_index and location_id=p_location_id;
 return true;
end;$$;
revoke all on function public.li_v2_retrieval_record(uuid,integer,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.li_v2_retrieval_record(uuid,integer,uuid,boolean,text) to service_role;

create or replace function public.li_v2_recover_quarantined_consumer_check(
 p_run_id uuid,p_index integer,p_location_id uuid
) returns boolean language plpgsql security definer set search_path='' as $$
declare v private.li_v2_consumer_retrieval_checks%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 select * into v from private.li_v2_consumer_retrieval_checks
  where run_id=p_run_id and target_index=p_index and location_id=p_location_id for update;
 if not found or v.status<>'quarantined' or v.attempts<>8 then return false; end if;
 if not exists(select 1 from private.li_v2_campaign_import_runs r
  where r.id=p_run_id and r.status='failed' and r.requested_action='run'
    and r.last_error='all_consumer_retrieval_checks_quarantined'
    and r.processed=p_index) then return false; end if;
 if not exists(select 1 from private.li_v2_maps_queue q
   where q.campaign_run_id=p_run_id and q.target_index=p_index
     and q.status='ready' and q.task_id is not null) then return false; end if;
 if not exists(select 1 from public.locations l
  where l.id=p_location_id and l.import_source='li_v2_independent'
    and l.is_searchable=true and l.publish_ready=true and l.quality_status='publish_ready'
    and l.active=true and l.is_hidden=false and l.has_photos=true
    and l.duplicate_status='unique' and l.data_status='clean'
    and exists(select 1 from public.location_search_embeddings e
      where e.location_id=l.id and e.status='ready')) then return false; end if;
 insert into private.li_v2_retrieval_recovery_audit
 (run_id,target_index,location_id,prior_attempts,prior_error,prior_status,reason)
 values(p_run_id,p_index,p_location_id,v.attempts,v.last_error,v.status,
 'post_publication_and_indexing_repair_bounded_consumer_reprobe')
 on conflict do nothing;
 if not found then return false; end if;
 update private.li_v2_consumer_retrieval_checks set
  status='pending',next_attempt_at=now(),updated_at=now()
 where run_id=p_run_id and target_index=p_index and location_id=p_location_id;
 update private.li_v2_campaign_import_runs set
  status='queued',finished_at=null,updated_at=now()
 where id=p_run_id;
 return true;
end;$$;
revoke all on function public.li_v2_recover_quarantined_consumer_check(uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.li_v2_recover_quarantined_consumer_check(uuid,integer,uuid) to service_role;
