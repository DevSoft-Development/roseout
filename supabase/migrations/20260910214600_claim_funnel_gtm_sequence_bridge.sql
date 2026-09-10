begin;

create or replace function public.gtm_bridge_claim_funnel_event()
returns trigger
language plpgsql
security invoker
set search_path=public,pg_temp
as $$
declare
  v_event text;
  v_now timestamptz;
begin
  v_now=coalesce(new.created_at,now());
  if new.location_id is null then return new; end if;

  if new.event_type='claim_page_opened' then
    v_event='claim_view';
    insert into public.gtm_events(location_id,event_type,channel,source,occurred_at,metadata)
    values(new.location_id,v_event,'claim','claim_funnel',v_now,jsonb_build_object('claim_funnel_event_id',new.id,'claim_code_id',new.claim_code_id));
    update public.locations set claim_viewed_at=coalesce(claim_viewed_at,v_now) where id=new.location_id;
    update public.gtm_location_state
      set gtm_status=case when gtm_status in ('observed','evaluated','qualified','sales_active') then 'engaged' else gtm_status end,
          last_signal_at=v_now,
          last_touch_source='claim',
          assisted_sources=array(select distinct x from unnest(assisted_sources||array['claim']) x),
          updated_at=now()
      where location_id=new.location_id and gtm_status not in ('customer','suppressed');
  elsif new.event_type='verification_started' then
    v_event='claim_started';
    insert into public.gtm_events(location_id,event_type,channel,source,occurred_at,metadata)
    values(new.location_id,v_event,'claim','claim_funnel',v_now,jsonb_build_object('claim_funnel_event_id',new.id,'claim_code_id',new.claim_code_id,'challenge_id',new.challenge_id));
    update public.locations set claim_started_at=coalesce(claim_started_at,v_now) where id=new.location_id;
    update public.gtm_location_state
      set gtm_status='claiming',last_signal_at=v_now,last_touch_source='claim',assisted_sources=array(select distinct x from unnest(assisted_sources||array['claim']) x),updated_at=now()
      where location_id=new.location_id and gtm_status not in ('customer','suppressed');
  end if;
  return new;
end $$;

revoke all on function public.gtm_bridge_claim_funnel_event() from public,anon,authenticated;
grant execute on function public.gtm_bridge_claim_funnel_event() to service_role;

drop trigger if exists trg_gtm_bridge_claim_funnel_event on public.claim_funnel_events;
create trigger trg_gtm_bridge_claim_funnel_event
after insert on public.claim_funnel_events
for each row execute function public.gtm_bridge_claim_funnel_event();

commit;
