create or replace function public.fraud_apply_action_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_state text;
begin
  v_state:=case
    when new.action_type='ban' then 'banned'
    when new.action_type in ('suspend','hold_payout','remove_content') then 'suspended'
    when new.action_type in ('limit_account','hold_publication','require_verification') then 'limited'
    when new.action_type in ('clear','restore') then 'none'
    else null
  end;

  if v_state is not null then
    insert into public.fraud_subjects(subject_type,subject_id,enforcement_state)
    values(new.subject_type,new.subject_id,v_state)
    on conflict(subject_type,subject_id)
    do update set enforcement_state=excluded.enforcement_state,updated_at=now();
  end if;

  if new.action_type in ('hold_publication','remove_content','suspend','ban') then
    if new.subject_type='event' then
      update public.events set searchable=false,updated_at=now() where id::text=new.subject_id;
    elsif new.subject_type='experience' then
      update public.experiences set searchable=false,updated_at=now() where id::text=new.subject_id;
    elsif new.subject_type='location' then
      update public.events set searchable=false,updated_at=now() where location_id::text=new.subject_id and searchable=true;
      update public.experiences set searchable=false,updated_at=now() where location_id::text=new.subject_id and searchable=true;
    elsif new.subject_type='organizer' then
      update public.events set searchable=false,updated_at=now() where organization_id::text=new.subject_id and searchable=true;
      update public.experiences set searchable=false,updated_at=now() where organization_id::text=new.subject_id and searchable=true;
    end if;
  end if;

  update public.fraud_cases
  set status=case when new.action_type in ('clear','restore') then 'closed' else 'actioned' end,
      last_activity_at=now(),
      updated_at=now()
  where id=new.case_id;

  insert into public.fraud_audit_log(case_id,subject_type,subject_id,event_type,actor_user_id,payload)
  values(new.case_id,new.subject_type,new.subject_id,'enforcement_action',new.actor_user_id,
    jsonb_build_object('action_type',new.action_type,'reason',new.reason,'ends_at',new.ends_at));
  return new;
end;
$$;
revoke all on function public.fraud_apply_action_state() from public, anon, authenticated;
grant execute on function public.fraud_apply_action_state() to service_role;
