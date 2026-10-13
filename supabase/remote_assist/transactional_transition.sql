-- Transactional state transition. Caller must authenticate actor and tenant in backend.
create or replace function public.pos_assist_transition(
 p_session uuid,p_expected_version integer,p_actor uuid,p_action text,p_capture_approved boolean default false
) returns public.pos_remote_assist_sessions language plpgsql security invoker set search_path = '' as $$
declare s public.pos_remote_assist_sessions; n timestamptz:=clock_timestamp();
begin
 select * into s from public.pos_remote_assist_sessions where id=p_session for update;
 if not found or s.version<>p_expected_version then raise exception 'session unavailable or version conflict'; end if;
 if s.state in ('ended','expired','revoked') then raise exception 'terminal session'; end if;
 if p_action='approve' and s.state='requested' and p_actor<>s.requested_by then
  update public.pos_remote_assist_sessions set state='approved',approved_by=p_actor,consent_expires_at=n+interval '15 minutes',version=version+1 where id=p_session returning * into s;
 elsif p_action='activate' and s.state='approved' and p_actor=s.requested_by and p_capture_approved and s.consent_expires_at>n then
  update public.pos_remote_assist_sessions set state='active',version=version+1 where id=p_session returning * into s;
 elsif p_action in ('revoke','end') and (p_actor=s.requested_by or p_actor=s.approved_by) then
  update public.pos_remote_assist_sessions set state=case when p_action='revoke' then 'revoked' else 'ended' end,ended_at=n,version=version+1 where id=p_session returning * into s;
 else raise exception 'invalid session transition'; end if;
 insert into public.pos_remote_assist_events(session_id,event_type,actor_id) values(p_session,p_action,p_actor);
 if s.state in ('revoked','ended') then update public.pos_remote_assist_relay_grants set revoked_at=n where session_id=p_session and revoked_at is null; end if;
 return s;
end $$;
revoke all on function public.pos_assist_transition(uuid,integer,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.pos_assist_transition(uuid,integer,uuid,text,boolean) to service_role;
