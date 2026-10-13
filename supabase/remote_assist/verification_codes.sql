-- Verification challenge, server-only. Never expose plaintext code or digest via client APIs.
create table if not exists public.pos_remote_assist_verification_codes (
 session_id uuid primary key references public.pos_remote_assist_sessions(id) on delete cascade,
 location_id uuid not null, device_id uuid not null, technician_id uuid not null,
 digest text not null check (digest ~ '^[0-9a-f]{64}$'),
 expires_at timestamptz not null,
 attempts integer not null default 0 check(attempts between 0 and 5),
 consumed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.pos_remote_assist_verification_codes enable row level security;
revoke all on public.pos_remote_assist_verification_codes from anon,authenticated;
create or replace function public.pos_assist_redeem_code(
 p_session uuid,p_location uuid,p_device uuid,p_technician uuid,p_digest text
) returns text language plpgsql security invoker set search_path='' as $$
declare v public.pos_remote_assist_verification_codes;
begin
 select * into v from public.pos_remote_assist_verification_codes where session_id=p_session for update;
 if not found then return 'rejected'; end if;
 if v.consumed_at is not null or v.attempts>=5 then return 'locked'; end if;
 if v.expires_at<=clock_timestamp() then return 'expired'; end if;
 if v.location_id<>p_location or v.device_id<>p_device or v.technician_id<>p_technician or v.digest<>p_digest then
  update public.pos_remote_assist_verification_codes set attempts=attempts+1 where session_id=p_session;
  return 'rejected';
 end if;
 update public.pos_remote_assist_verification_codes set consumed_at=clock_timestamp() where session_id=p_session;
 insert into public.pos_remote_assist_events(session_id,event_type,actor_id) values(p_session,'verification_succeeded',p_technician);
 return 'accepted';
end $$;
revoke all on function public.pos_assist_redeem_code(uuid,uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
