-- This guard must be evaluated inside the locked activation transaction.
create or replace function public.pos_assist_session_authorized(
 p_session uuid,p_location uuid,p_device uuid,p_technician uuid
) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(
  select 1 from public.pos_remote_assist_sessions s
  join public.pos_remote_assist_authorized_technicians a
   on a.location_id=s.location_id and a.device_id=s.device_id
   and a.technician_id=s.requested_by
  where s.id=p_session and s.location_id=p_location and s.device_id=p_device
   and s.requested_by=p_technician and s.approved_by is not null
   and s.approved_by<>p_technician and s.state='approved'
   and s.consent_expires_at>clock_timestamp()
   and a.revoked_at is null and a.expires_at>clock_timestamp()
 )
$$;
revoke all on function public.pos_assist_session_authorized(uuid,uuid,uuid,uuid)
 from public,anon,authenticated,service_role,pos_assist_backend;
