-- Fail-closed atomic activation. No client or service_role EXECUTE grant.
-- A future authenticated backend adapter must use a narrowly privileged database role.
create or replace function public.pos_assist_activate_verified(
 p_session uuid,p_location uuid,p_device uuid,p_technician uuid,p_expected_version integer
) returns boolean language plpgsql security invoker set search_path='' as $$
declare s public.pos_remote_assist_sessions; v public.pos_remote_assist_verifications;
begin
 select * into s from public.pos_remote_assist_sessions
  where id=p_session and location_id=p_location and device_id=p_device for update;
 if not found or s.state<>'approved' or s.version<>p_expected_version
    or s.consent_expires_at<=clock_timestamp() then return false; end if;
 select * into v from public.pos_remote_assist_verifications
  where session_id=p_session for update;
 if not found or v.technician_id<>p_technician or v.consumed_at is not null
    or v.verified_at<clock_timestamp()-interval '2 minutes' then return false; end if;
 -- Native capture attestation must be verified by the backend immediately before calling.
 -- No external execution privileges until attestation binding and principal authorization exist.
 update public.pos_remote_assist_verifications set consumed_at=clock_timestamp() where session_id=p_session;
 update public.pos_remote_assist_sessions set state='active',version=version+1
  where id=p_session;
 insert into public.pos_remote_assist_events(session_id,event_type,actor_id)
  values(p_session,'activated_after_verification',p_technician);
 return true;
end $$;
revoke all on function public.pos_assist_activate_verified(uuid,uuid,uuid,uuid,integer)
 from public,anon,authenticated,service_role;
