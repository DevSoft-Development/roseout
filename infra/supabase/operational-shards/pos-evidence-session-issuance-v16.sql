-- Atomic customer-session issuance. Apply separately after v14, pending certification.
-- Service-only function; per-tender advisory transaction lock prevents concurrent issuance.
begin;
create or replace function public.pos_issue_evidence_session(
 p_nonce uuid,p_location_id uuid,p_check_id uuid,p_tender_id uuid,
 p_device_id text,p_expires_at timestamptz
) returns boolean language plpgsql security invoker set search_path=public as $$
begin
 if p_expires_at<=now() or p_expires_at>now()+interval '125 seconds' or
    nullif(trim(p_device_id),'') is null then return false; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_tender_id::text, 0));
 if exists(
  select 1 from public.pos_evidence_customer_sessions
  where location_id=p_location_id and tender_id=p_tender_id
    and consumed_at is null and expires_at>now()
 ) then return false; end if;
 insert into public.pos_evidence_customer_sessions(
  nonce,location_id,check_id,tender_id,device_id,expires_at
 ) values (p_nonce,p_location_id,p_check_id,p_tender_id,p_device_id,p_expires_at);
 return true;
end $$;
revoke all on function public.pos_issue_evidence_session(uuid,uuid,uuid,uuid,text,timestamptz)
 from public,anon,authenticated;
grant execute on function public.pos_issue_evidence_session(uuid,uuid,uuid,uuid,text,timestamptz)
 to service_role;
commit;
