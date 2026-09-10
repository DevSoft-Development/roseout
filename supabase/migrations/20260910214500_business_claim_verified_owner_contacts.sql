begin;

create or replace function public.gtm_enroll_location_sequence(p_location_id uuid,p_sequence_key text)
returns uuid
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_sequence_id uuid; v_account_id uuid; v_contact_id uuid; v_owner uuid; v_existing uuid; v_source text;
  v_claim_email text; v_contact_discovery_required boolean;
begin
  select id into v_sequence_id from public.crm_sequences where sequence_key=p_sequence_key and status='active' and archived_at is null;
  if v_sequence_id is null then return null; end if;

  select crm_account_id into v_account_id from public.gtm_location_state
    where location_id=p_location_id and association_level='full' and suppressed=false;
  if v_account_id is null then return null; end if;

  v_contact_discovery_required=(p_sequence_key='business-claim-outreach');

  -- Cold acquisition only uses a high-confidence public business email discovered from the
  -- official business presence. Post-claim lifecycle messages may instead use the verified
  -- owner email collected in the claim process.
  select d.contact_id into v_contact_id
  from public.gtm_contact_discoveries d
  join public.crm_contacts c on c.id=d.contact_id
  where d.location_id=p_location_id
    and d.contact_kind='email'
    and d.confidence>=80
    and d.verification_status in ('discovered','verified')
    and c.archived_at is null
    and c.do_not_contact=false
  order by case when d.verification_status='verified' then 0 else 1 end,d.confidence desc,d.created_at asc
  limit 1;

  if v_contact_id is null and not v_contact_discovery_required then
    select nullif(lower(trim(claimed_by_email)),'') into v_claim_email from public.locations where id=p_location_id;
    if v_claim_email is null then
      select nullif(lower(trim(owner_email)),'') into v_claim_email
      from public.location_claim_requests
      where location_id=p_location_id and owner_email is not null and status in ('pending','needs_more_info','approved')
      order by created_at desc limit 1;
    end if;
    if v_claim_email is not null then
      select id into v_contact_id from public.crm_contacts where lower(email)=v_claim_email and archived_at is null order by created_at asc limit 1;
      if v_contact_id is null then
        insert into public.crm_contacts(email,contact_type,preferred_channel,email_consent_status,do_not_contact,metadata)
        values(v_claim_email,'owner','email','unknown',false,jsonb_build_object('source','verified_claim_contact','location_id',p_location_id))
        returning id into v_contact_id;
      end if;
      if not exists(select 1 from public.crm_account_contacts where account_id=v_account_id and contact_id=v_contact_id and is_active=true) then
        insert into public.crm_account_contacts(account_id,contact_id,relationship_type,role_label,is_primary,is_active,source)
        values(v_account_id,v_contact_id,'owner','Owner / authorized business contact',true,true,'verified_claim_contact');
      end if;
    end if;
  end if;

  if v_contact_id is null then return null; end if;
  if exists(
    select 1 from public.crm_suppression_entries s
    join public.crm_contacts c on c.id=v_contact_id
    where s.is_active=true and s.channel='email' and (s.contact_id=v_contact_id or lower(s.address)=lower(c.email))
  ) then return null; end if;

  select owner_user_id into v_owner from public.crm_location_territories where location_id=p_location_id limit 1;
  v_source='gtm:'||p_location_id::text||':'||p_sequence_key;
  select id into v_existing from public.crm_sequence_enrollments where source_system='gtm' and source_record_id=v_source limit 1;
  if v_existing is not null then return v_existing; end if;

  insert into public.crm_sequence_enrollments(sequence_id,contact_id,account_id,location_id,owner_user_id,status,current_step_order,next_step_at,source_system,source_record_id)
  values(v_sequence_id,v_contact_id,v_account_id,p_location_id,v_owner,'active',1,now(),'gtm',v_source)
  returning id into v_existing;
  return v_existing;
end $$;

revoke all on function public.gtm_enroll_location_sequence(uuid,text) from public,anon,authenticated;
grant execute on function public.gtm_enroll_location_sequence(uuid,text) to service_role;

commit;
