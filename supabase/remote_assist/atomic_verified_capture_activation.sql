-- Secure activation must consume both proofs in the same transaction.
-- This replaces the earlier verification-only function; no public execution grants.
create or replace function public.pos_assist_activate_verified(
 p_session uuid,p_location uuid,p_device uuid,p_technician uuid,p_expected_version integer
) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.pos_remote_assist_sessions;
declare v public.pos_remote_assist_verifications;
declare c public.pos_remote_assist_capture_attestations;
declare t timestamptz;
begin
 t:=clock_timestamp();
 select * into s from public.pos_remote_assist_sessions
 where id=p_session and location_id=p_location and device_id=p_device for update;
 if not found or s.state<>'approved' or s.version<>p_expected_version
 or s.consent_expires_at is null or s.consent_expires_at<=t then return false; end if;
 select * into v from public.pos_remote_assist_verifications
 where session_id=p_session for update;
 if not found or v.technician_id<>p_technician or v.consumed_at is not null
 or v.verified_at<t-interval '2 minutes' then return false; end if;
 select * into c from public.pos_remote_assist_capture_attestations
 where session_id=p_session for update;
 if not found or c.location_id<>p_location or c.device_id<>p_device
 or c.revoked_at is not null or c.approved_at>t or c.expires_at<=t then return false; end if;
 update public.pos_remote_assist_verifications set consumed_at=t where session_id=p_session;
 update public.pos_remote_assist_capture_attestations set revoked_at=t where session_id=p_session;
 update public.pos_remote_assist_sessions set state='active',version=version+1 where id=p_session;
 insert into public.pos_remote_assist_events(session_id,event_type,actor_id)
 values(p_session,'activated_with_code_and_native_capture',p_technician);
 return true;
end $$;
revoke all on function public.pos_assist_activate_verified(uuid,uuid,uuid,uuid,integer)
 from public,anon,authenticated,service_role;
