create or replace function public.social_manager_sync_growth_opportunity() returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if new.opportunity_score < 50 or new.person_type in ('support','press','unknown') then return new; end if;
  insert into public.social_growth_opportunities(provider,opportunity_type,external_id,title,summary,intent,area,timing,opportunity_strength,score,source_url,suggested_reply,status,metadata)
  values(new.provider,case when new.person_type='creator' then 'creator' else 'conversation' end,new.id::text,trim(coalesce(new.intent,'Social opportunity')||case when new.area is not null then ' · '||new.area else '' end),case when new.person_type='business' then 'A business is interested in TheOutHaven.' when new.person_type='creator' then 'A creator is interested in working with TheOutHaven.' else 'Someone is actively looking for an outing idea.' end,new.intent,new.area,new.timing,new.opportunity_strength,new.opportunity_score,new.source_permalink,new.metadata->>'suggested_reply','new',jsonb_build_object('conversation_id',new.id,'person_type',new.person_type))
  on conflict (provider,external_id) do update set title=excluded.title,summary=excluded.summary,intent=excluded.intent,area=excluded.area,timing=excluded.timing,opportunity_strength=excluded.opportunity_strength,score=excluded.score,source_url=excluded.source_url,suggested_reply=excluded.suggested_reply,metadata=public.social_growth_opportunities.metadata||excluded.metadata;
  return new;
end;
$$;

drop trigger if exists social_manager_sync_growth_opportunity_trg on public.social_community_conversations;
create trigger social_manager_sync_growth_opportunity_trg after insert or update of person_type,intent,area,timing,opportunity_strength,opportunity_score on public.social_community_conversations for each row execute function public.social_manager_sync_growth_opportunity();
