-- Atomically redeem technician code and create durable activation proof.
-- Invoker must be an explicitly authorized backend DB role; no public execution.
create or replace function public.pos_assist_redeem_code(
 p_session uuid,p_location uuid,p_device uuid,p_technician uuid,p_digest text
) returns text language plpgsql security invoker set search_path='' as $$
declare v public.pos_remote_assist_verification_codes;
declare s public.pos_remote_assist_sessions;
declare t timestamptz;
begin
 t:=clock_timestamp();
 select * into s from public.pos_remote_assist_sessions
 where id=p_session and location_id=p_location and device_id=p_device for update;
 if not found or s.state<>'approved' or s.consent_expires_at is null or s.consent_expires_at<=t
 then return 'rejected'; end if;
 select * into v from public.pos_remote_assist_verification_codes
 where session_id=p_session for update;
 if not found then return 'rejected'; end if;
 if v.consumed_at is not null or v.attempts>=5 then return 'locked'; end if;
 if v.expires_at<=t then return 'expired'; end if;
 if v.location_id<>p_location or v.device_id<>p_device or v.technician_id<>p_technician
    or v.digest<>p_digest then
  update public.pos_remote_assist_verification_codes
  set attempts=attempts+1 where session_id=p_session;
  return 'rejected';
 end if;
 update public.pos_remote_assist_verification_codes set consumed_at=t where session_id=p_session;
 insert into public.pos_remote_assist_verifications(session_id,technician_id,verified_at,consumed_at)
 values(p_session,p_technician,t,null)
 on conflict(session_id) do update set technician_id=excluded.technician_id,
 verified_at=excluded.verified_at,consumed_at=null;
 insert into public.pos_remote_assist_events(session_id,event_type,actor_id)
 values(p_session,'verification_succeeded',p_technician);
 return 'accepted';
end $$;
revoke all on function public.pos_assist_redeem_code(uuid,uuid,uuid,uuid,text)
 from public,anon,authenticated,service_role;
