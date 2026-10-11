-- toh:replicated-dml-reviewed
-- Review: INSERT/UPDATE tokens below occur only inside CREATE FUNCTION definitions.
-- The migration executes no transactional row DML. Virginia remains authoritative;
-- automatic dual-region deployment preflight executes Oregon with origin triggers
-- suppressed. All runtime writes target isolated monitoring-only tables.
-- Monitoring-only records: no POS transaction, device, or merchant writes.
create table if not exists public.pos_monitor_scan_runs (
 id uuid primary key default gen_random_uuid(),
 scan_day date not null,
 status text not null default 'running' check (status in ('running','complete','failed')),
 next_offset integer not null default 0 check (next_offset >= 0),
 scanned integer not null default 0,
 counts jsonb not null default '{"healthy":0,"expected_offline":0,"awaiting_startup":0,"needs_attention":0,"unknown":0}'::jsonb,
 started_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 finished_at timestamptz,
 error text,
 unique(scan_day)
);
create table if not exists public.pos_monitor_location_history (
 id bigint generated always as identity primary key,
 scan_id uuid not null references public.pos_monitor_scan_runs(id) on delete cascade,
 location_id text not null,
 observed_at timestamptz not null default now(),
 state text not null check (state in ('healthy','expected_offline','awaiting_startup','needs_attention','unknown')),
 device_count integer not null default 0,
 attention_count integer not null default 0,
 unique(scan_id,location_id)
);
create index if not exists pos_monitor_location_history_location_time_idx on public.pos_monitor_location_history(location_id,observed_at desc);
create table if not exists public.pos_monitor_device_incidents (
 device_id text primary key,
 location_id text not null,
 state text not null check (state in ('open','resolved')),
 reason text not null,
 first_seen_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now(),
 last_notified_at timestamptz,
 resolved_at timestamptz
);
create index if not exists pos_monitor_device_incidents_location_idx on public.pos_monitor_device_incidents(location_id,state);
alter table public.pos_monitor_scan_runs enable row level security;
alter table public.pos_monitor_location_history enable row level security;
alter table public.pos_monitor_device_incidents enable row level security;
revoke all on public.pos_monitor_scan_runs,public.pos_monitor_location_history,public.pos_monitor_device_incidents from anon,authenticated;
grant select,insert,update,delete on public.pos_monitor_scan_runs,public.pos_monitor_location_history,public.pos_monitor_device_incidents to service_role;
grant usage,select on sequence public.pos_monitor_location_history_id_seq to service_role;

-- Batch incident lifecycle: preserve original creation and notification timestamps,
-- resolve recovered devices, and never send notifications from this function.
create or replace function public.pos_monitor_reconcile_incidents(p_observations jsonb)
returns integer language plpgsql security definer set search_path=public as $$
declare entry jsonb; changed integer:=0; v_state text; v_device text; v_location text;
begin
 if auth.role() is distinct from 'service_role' then
   raise exception 'pos_monitor_service_role_required';
 end if;
 if jsonb_typeof(p_observations) is distinct from 'array' or jsonb_array_length(p_observations)>150 then
   raise exception 'pos_monitor_invalid_batch';
 end if;
 for entry in select value from jsonb_array_elements(p_observations) loop
   v_device:=nullif(entry->>'device_id','');
   v_location:=nullif(entry->>'location_id','');
   v_state:=entry->>'state';
   if v_device is null or v_location is null then continue; end if;
   if v_state='needs_attention' then
     insert into public.pos_monitor_device_incidents(device_id,location_id,state,reason)
     values(v_device,v_location,'open',coalesce(entry->>'reason','required_device_offline'))
     on conflict(device_id) do update set
       state='open',location_id=excluded.location_id,reason=excluded.reason,
       last_seen_at=now(),resolved_at=null,
       first_seen_at=case when public.pos_monitor_device_incidents.state='resolved' then now() else public.pos_monitor_device_incidents.first_seen_at end;
     changed:=changed+1;
   elsif v_state in ('healthy','expected_offline') then
     update public.pos_monitor_device_incidents set state='resolved',resolved_at=now(),last_seen_at=now()
     where device_id=v_device and state='open';
   end if;
 end loop;
 return changed;
end $$;
revoke all on function public.pos_monitor_reconcile_incidents(jsonb) from public,anon,authenticated;
grant execute on function public.pos_monitor_reconcile_incidents(jsonb) to service_role;

-- Idempotent per-assignment snapshots. Replayed pages overwrite observations,
-- never inflate the final per-location aggregate.
create table if not exists public.pos_monitor_device_observations (
 scan_id uuid not null references public.pos_monitor_scan_runs(id) on delete cascade,
 assignment_id text not null,
 location_id text not null,
 device_id text not null,
 state text not null check(state in ('healthy','expected_offline','awaiting_startup','needs_attention','unknown')),
 reason text not null,
 observed_at timestamptz not null default now(),
 primary key(scan_id,assignment_id)
);
create index if not exists pos_monitor_device_observations_location_idx
 on public.pos_monitor_device_observations(scan_id,location_id);
alter table public.pos_monitor_device_observations enable row level security;
revoke all on public.pos_monitor_device_observations from anon,authenticated;
grant select,insert,update,delete on public.pos_monitor_device_observations to service_role;

create or replace function public.pos_monitor_finalize_scan(p_scan_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare summary jsonb;
begin
 if auth.role() is distinct from 'service_role' then raise exception 'pos_monitor_service_role_required'; end if;
 insert into public.pos_monitor_location_history(scan_id,location_id,observed_at,state,device_count,attention_count)
 select p_scan_id, location_id,max(observed_at),
 case when bool_or(state='needs_attention') then 'needs_attention'
      when bool_or(state='unknown') then 'unknown'
      when bool_or(state='awaiting_startup') then 'awaiting_startup'
      when bool_or(state='expected_offline') then 'expected_offline'
      else 'healthy' end,
 count(*)::integer,count(*) filter(where state='needs_attention')::integer
 from public.pos_monitor_device_observations
 where scan_id=p_scan_id group by location_id
 on conflict(scan_id,location_id) do update set observed_at=excluded.observed_at,
 state=excluded.state,device_count=excluded.device_count,attention_count=excluded.attention_count;
 select jsonb_build_object(
 'healthy',count(*) filter(where state='healthy'),
 'expected_offline',count(*) filter(where state='expected_offline'),
 'awaiting_startup',count(*) filter(where state='awaiting_startup'),
 'needs_attention',count(*) filter(where state='needs_attention'),
 'unknown',count(*) filter(where state='unknown')
 ) into summary from public.pos_monitor_device_observations where scan_id=p_scan_id;
 update public.pos_monitor_scan_runs set counts=summary,
 scanned=(select count(*) from public.pos_monitor_device_observations where scan_id=p_scan_id),
 status='complete',finished_at=now(),updated_at=now()
 where id=p_scan_id;
 return summary;
end $$;
revoke all on function public.pos_monitor_finalize_scan(uuid) from public,anon,authenticated;
grant execute on function public.pos_monitor_finalize_scan(uuid) to service_role;
