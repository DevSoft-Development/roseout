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
