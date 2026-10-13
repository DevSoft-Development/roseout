-- Durable, single-use verification proof. Access stays backend-only until trusted routing exists.
create table if not exists public.pos_remote_assist_verifications (
 session_id uuid primary key references public.pos_remote_assist_sessions(id) on delete cascade,
 technician_id uuid not null,
 verified_at timestamptz not null default clock_timestamp(),
 consumed_at timestamptz,
 check (consumed_at is null or consumed_at >= verified_at)
);
alter table public.pos_remote_assist_verifications enable row level security;
revoke all on public.pos_remote_assist_verifications from public,anon,authenticated,service_role;
-- A proof is usable only once, within a short window, by its bound technician.
-- The caller must be a trusted backend with explicit DB privileges and must
-- atomically consume the proof in the SAME transaction as activation.
create or replace function public.pos_assist_consume_verification(
 p_session uuid,p_technician uuid
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v public.pos_remote_assist_verifications;
begin
 select * into v from public.pos_remote_assist_verifications
 where session_id=p_session for update;
 if not found or v.technician_id<>p_technician or v.consumed_at is not null
    or v.verified_at < clock_timestamp()-interval '2 minutes' then
  return false;
 end if;
 update public.pos_remote_assist_verifications
 set consumed_at=clock_timestamp() where session_id=p_session;
 return true;
end $$;
revoke all on function public.pos_assist_consume_verification(uuid,uuid)
 from public,anon,authenticated,service_role;
