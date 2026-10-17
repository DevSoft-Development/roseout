-- Durable, free/read-only consumer retrieval certification. This never authorizes
-- protected Search V3 lanes or spending and never retries a provider POST.
create table if not exists private.li_v2_consumer_retrieval_checks (
 run_id uuid not null references private.li_v2_campaign_import_runs(id),
 target_index integer not null check(target_index>=0),
 location_id uuid not null,
 status text not null default 'pending' check(status in ('pending','verified','quarantined')),
 attempts integer not null default 0 check(attempts>=0),
 last_error text,
 next_attempt_at timestamptz not null default now(),
 verified_at timestamptz,
 updated_at timestamptz not null default now(),
 primary key(run_id,target_index,location_id)
);
revoke all on private.li_v2_consumer_retrieval_checks from public,anon,authenticated;
alter table private.li_v2_consumer_retrieval_checks enable row level security;
create index if not exists li_v2_consumer_retrieval_due on private.li_v2_consumer_retrieval_checks(run_id,target_index,status,next_attempt_at);

create or replace function public.li_v2_retrieval_register(p_run_id uuid,p_index integer,p_ids uuid[])
returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 if p_index < 0 or coalesce(array_length(p_ids,1),0)>50 then raise exception 'invalid_certification_batch'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 if not exists(select 1 from private.li_v2_campaign_import_runs where id=p_run_id and status='running' and requested_action='run')
 then raise exception 'certification_run_not_authorized'; end if;
 if not exists(select 1 from private.li_v2_maps_queue where campaign_run_id=p_run_id and target_index=p_index and status='ready')
 then raise exception 'certification_queue_not_ready'; end if;
 insert into private.li_v2_consumer_retrieval_checks(run_id,target_index,location_id)
 select p_run_id,p_index,x from unnest(p_ids) x
 where exists(select 1 from public.locations l where l.id=x and l.import_source='li_v2_independent')
 on conflict do nothing;
 get diagnostics n=row_count;
 return n;
end;$$;
revoke all on function public.li_v2_retrieval_register(uuid,integer,uuid[]) from public,anon,authenticated;
grant execute on function public.li_v2_retrieval_register(uuid,integer,uuid[]) to service_role;

create or replace function public.li_v2_retrieval_snapshot(p_run_id uuid,p_index integer)
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object(
 'location_id',c.location_id,'status',c.status,'attempts',c.attempts,
 'due',c.next_attempt_at<=now(),'name',l.name,'city',l.city,
 'location_type',l.location_type,'is_searchable',l.is_searchable
 ) order by c.location_id),'[]'::jsonb)
 from private.li_v2_consumer_retrieval_checks c
 join public.locations l on l.id=c.location_id
 where c.run_id=p_run_id and c.target_index=p_index and auth.role()='service_role';
$$;
revoke all on function public.li_v2_retrieval_snapshot(uuid,integer) from public,anon,authenticated;
grant execute on function public.li_v2_retrieval_snapshot(uuid,integer) to service_role;

create or replace function public.li_v2_retrieval_record(
 p_run_id uuid,p_index integer,p_location_id uuid,p_found boolean,p_error text default null
) returns boolean language plpgsql security definer set search_path='' as $$
declare v private.li_v2_consumer_retrieval_checks%rowtype;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'service_role_required'; end if;
 perform pg_catalog.pg_advisory_xact_lock(6742031);
 if not exists(select 1 from private.li_v2_campaign_import_runs where id=p_run_id and status='running' and requested_action='run')
 then return false; end if;
 select * into v from private.li_v2_consumer_retrieval_checks
 where run_id=p_run_id and target_index=p_index and location_id=p_location_id for update;
 if not found or v.status<>'pending' or v.next_attempt_at>now() then return false; end if;
 update private.li_v2_consumer_retrieval_checks
 set attempts=attempts+1,
 status=case when p_found then 'verified' when attempts+1>=8 then 'quarantined' else 'pending' end,
 last_error=case when p_found then null else left(coalesce(p_error,'not_returned'),300) end,
 next_attempt_at=case when p_found then now() else now()+make_interval(mins=>least(30,power(2,least(attempts,4))::integer)) end,
 verified_at=case when p_found then now() else null end, updated_at=now()
 where run_id=p_run_id and target_index=p_index and location_id=p_location_id;
 return true;
end;$$;
revoke all on function public.li_v2_retrieval_record(uuid,integer,uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.li_v2_retrieval_record(uuid,integer,uuid,boolean,text) to service_role;
