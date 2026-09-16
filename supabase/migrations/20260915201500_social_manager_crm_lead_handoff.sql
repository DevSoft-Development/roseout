create or replace function public.social_manager_sync_lead() returns trigger language plpgsql security invoker set search_path=public as $$
declare
  social_contact record;
  crm_contact_id uuid;
  task_exists boolean;
  creator_key text;
begin
  if new.person_type not in ('business','creator') then return new; end if;
  select * into social_contact from public.social_community_contacts where id=new.contact_id;
  if social_contact.id is null then return new; end if;
  crm_contact_id := social_contact.linked_crm_contact_id;
  if crm_contact_id is null then
    select id into crm_contact_id from public.crm_contacts where metadata->>'social_provider'=new.provider and metadata->>'social_external_user_id'=social_contact.external_user_id and archived_at is null order by created_at desc limit 1;
  end if;
  if crm_contact_id is null then
    insert into public.crm_contacts(full_name,instagram_handle,contact_type,preferred_channel,metadata)
    values (coalesce(nullif(social_contact.display_name,''),nullif(social_contact.username,''),initcap(new.person_type)||' social lead'),case when new.provider='instagram' then social_contact.username else null end,case when new.person_type='creator' then 'partner' else 'business' end,'social',jsonb_build_object('source','social_manager','social_provider',new.provider,'social_external_user_id',social_contact.external_user_id,'social_username',social_contact.username))
    returning id into crm_contact_id;
    update public.social_community_contacts set linked_crm_contact_id=crm_contact_id where id=social_contact.id;
  end if;
  if new.person_type='creator' then
    creator_key := new.provider||':'||social_contact.external_user_id;
    insert into public.gtm_creator_sources(creator_key,display_name,platform,status,metadata)
    values (creator_key,coalesce(nullif(social_contact.display_name,''),nullif(social_contact.username,''),'Creator'),new.provider,'active',jsonb_build_object('social_contact_id',social_contact.id,'conversation_id',new.id,'username',social_contact.username))
    on conflict (creator_key) do update set display_name=excluded.display_name,platform=excluded.platform,status='active',metadata=public.gtm_creator_sources.metadata||excluded.metadata,updated_at=now();
  end if;
  select exists(select 1 from public.crm_tasks where source='social_manager' and source_record_id=new.id::text and archived_at is null) into task_exists;
  if not task_exists then
    insert into public.crm_tasks(contact_id,title,description,task_type,status,priority,assigned_team,queue_key,category,subtype,source,source_record_id,metadata)
    values (crm_contact_id,case when new.person_type='creator' then 'Review new creator interest' else 'Follow up with interested business' end,coalesce(new.intent,'New social conversation')||coalesce(' · '||new.area,''),case when new.person_type='creator' then 'outreach' else 'sales' end,'open',case when new.opportunity_score>=80 then 'high' else 'normal' end,case when new.person_type='creator' then 'marketing' else 'sales' end,case when new.person_type='creator' then 'partnerships' else 'sales' end,'marketing',case when new.person_type='creator' then 'social_creator_lead' else 'social_business_lead' end,'social_manager',new.id::text,jsonb_build_object('deep_link','/admin/dashboard/marketing/community?conversation='||new.id::text,'provider',new.provider,'opportunity_strength',new.opportunity_strength));
  end if;
  return new;
end;
$$;

drop trigger if exists social_manager_sync_lead_trg on public.social_community_conversations;
create trigger social_manager_sync_lead_trg after insert or update of person_type,opportunity_score on public.social_community_conversations for each row execute function public.social_manager_sync_lead();
