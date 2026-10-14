-- Customer signature one-time sessions, per operational shard.
begin;
create table if not exists public.pos_evidence_customer_sessions (
  nonce uuid primary key,
  location_id uuid not null references public.locations(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  tender_id uuid not null references public.pos_tenders(id) on delete cascade,
  device_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);
create index if not exists pos_evidence_customer_sessions_tender_idx
 on public.pos_evidence_customer_sessions(location_id,tender_id,expires_at);
alter table public.pos_evidence_customer_sessions enable row level security;
revoke all on public.pos_evidence_customer_sessions from public,anon,authenticated;
grant select,insert,update on table public.pos_evidence_customer_sessions to service_role;
-- Atomically consume one token. Caller MUST also verify token MAC, device, and settled tender.
create or replace function public.pos_consume_evidence_session(
 p_nonce uuid,p_location_id uuid,p_check_id uuid,p_tender_id uuid,p_device_id text
) returns boolean language plpgsql security invoker set search_path=public as $$
declare v_count integer;
begin
 update public.pos_evidence_customer_sessions
 set consumed_at=now()
 where nonce=p_nonce and location_id=p_location_id and check_id=p_check_id
 and tender_id=p_tender_id and device_id=p_device_id
 and consumed_at is null and expires_at>now();
 get diagnostics v_count=row_count;
 return v_count=1;
end $$;
revoke all on function public.pos_consume_evidence_session(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.pos_consume_evidence_session(uuid,uuid,uuid,uuid,text) to service_role;
commit;
