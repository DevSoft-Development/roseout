create or replace function public.fraud_decide_subject(p_subject_type text, p_subject_id text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_subject public.fraud_subjects;
  v_case public.fraud_cases;
  v_action public.fraud_actions;
  v_has_action_history boolean := false;
  v_decision text := 'allow';
  v_reason text := 'no_active_risk';
  v_score integer := 0;
  v_band text := 'low';
  v_enforcement text := 'none';
begin
  select * into v_subject
  from public.fraud_subjects
  where subject_type=p_subject_type and subject_id=p_subject_id;

  if v_subject.id is not null then
    v_score := greatest(0, least(100, coalesce(v_subject.risk_score,0)));
    v_band := coalesce(v_subject.risk_band,'low');
    v_enforcement := coalesce(v_subject.enforcement_state,'none');
  end if;

  select * into v_case
  from public.fraud_cases
  where primary_subject_type=p_subject_type
    and primary_subject_id=p_subject_id
    and status in ('open','investigating','awaiting_evidence','actioned','appealed')
  order by opened_at desc
  limit 1;

  select exists(
    select 1 from public.fraud_actions
    where subject_type=p_subject_type and subject_id=p_subject_id
  ) into v_has_action_history;

  select * into v_action
  from public.fraud_actions
  where subject_type=p_subject_type
    and subject_id=p_subject_id
    and (action_type in ('clear','restore') or ends_at is null or ends_at > now())
  order by created_at desc
  limit 1;

  if v_action.id is not null then
    v_decision := case
      when v_action.action_type in ('ban','suspend','remove_content') then 'block'
      when v_action.action_type in ('hold_publication','hold_payout') then 'hold'
      when v_action.action_type in ('require_verification','limit_account') then 'step_up_verification'
      when v_action.action_type='monitor' then 'monitor'
      when v_action.action_type in ('clear','restore') then 'allow'
      else 'allow'
    end;
    v_reason := 'enforcement_' || v_action.action_type;
  elsif not v_has_action_history and v_enforcement='banned' then
    v_decision := 'block'; v_reason := 'subject_banned';
  elsif not v_has_action_history and v_enforcement='suspended' then
    v_decision := 'hold'; v_reason := 'subject_suspended';
  elsif not v_has_action_history and v_enforcement='limited' then
    v_decision := 'step_up_verification'; v_reason := 'subject_limited';
  elsif v_score >= 85 then
    v_decision := 'hold'; v_reason := 'critical_risk';
  elsif v_score >= 65 then
    v_decision := 'manual_review'; v_reason := 'high_risk';
  elsif v_case.id is not null and v_score >= 40 then
    v_decision := 'manual_review'; v_reason := 'active_fraud_case';
  elsif v_score >= 40 then
    v_decision := 'monitor'; v_reason := 'elevated_risk';
  elsif v_score >= 20 then
    v_decision := 'monitor'; v_reason := 'guarded_risk';
  end if;

  return jsonb_build_object(
    'subjectType',p_subject_type,
    'subjectId',p_subject_id,
    'decision',v_decision,
    'riskScore',v_score,
    'riskBand',v_band,
    'enforcementState',v_enforcement,
    'activeCaseId',case when v_case.id is null then null else v_case.id::text end,
    'activeCaseStatus',v_case.status,
    'actionType',v_action.action_type,
    'reasonCode',v_reason
  );
end;
$$;
revoke all on function public.fraud_decide_subject(text,text) from public, anon, authenticated;
grant execute on function public.fraud_decide_subject(text,text) to service_role;

create or replace function fraud_internal.decision_blocks_sensitive_action(p_decision jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = pg_catalog
as $$
  select coalesce(p_decision->>'decision','allow') in ('step_up_verification','manual_review','hold','block');
$$;
revoke all on function fraud_internal.decision_blocks_sensitive_action(jsonb) from public, anon, authenticated;

create or replace function fraud_internal.guard_location_claim_approval()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_decision jsonb;
begin
  if new.status='approved' and old.status is distinct from new.status then
    v_decision := public.fraud_decide_subject('claim',new.id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then
      raise exception 'fraud_review_required:claim';
    end if;
    if new.location_id is not null then
      v_decision := public.fraud_decide_subject('location',new.location_id::text);
      if fraud_internal.decision_blocks_sensitive_action(v_decision) then
        raise exception 'fraud_review_required:location';
      end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.guard_location_claim_approval() from public, anon, authenticated;
drop trigger if exists fraud_guard_location_claim_approval on public.location_claim_requests;
create trigger fraud_guard_location_claim_approval
before update of status on public.location_claim_requests
for each row execute function fraud_internal.guard_location_claim_approval();

create or replace function fraud_internal.guard_event_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_decision jsonb;
  v_connect text;
begin
  if new.status='scheduled' and (old.status is distinct from new.status or coalesce(old.searchable,false)=false and coalesce(new.searchable,false)=true) then
    v_decision := public.fraud_decide_subject('event',new.id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:event'; end if;

    if new.location_id is not null then
      v_decision := public.fraud_decide_subject('location',new.location_id::text);
      if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:location'; end if;
      select stripe_connect_account_id into v_connect from public.locations where id=new.location_id;
    elsif new.organization_id is not null then
      v_decision := public.fraud_decide_subject('organizer',new.organization_id::text);
      if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:organizer'; end if;
      select stripe_connect_account_id into v_connect from public.organizations where id=new.organization_id;
    end if;

    if v_connect is not null and btrim(v_connect) <> '' then
      v_decision := public.fraud_decide_subject('payout','connect-account:' || v_connect);
      if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:payout'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.guard_event_publication() from public, anon, authenticated;
drop trigger if exists fraud_guard_event_publication on public.events;
create trigger fraud_guard_event_publication
before update of status, searchable on public.events
for each row execute function fraud_internal.guard_event_publication();

create or replace function fraud_internal.guard_experience_publication()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_decision jsonb;
begin
  if new.status='published' and (old.status is distinct from new.status or coalesce(old.searchable,false)=false and coalesce(new.searchable,false)=true) then
    v_decision := public.fraud_decide_subject('experience',new.id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:experience'; end if;
    if new.location_id is not null then
      v_decision := public.fraud_decide_subject('location',new.location_id::text);
      if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:location'; end if;
    elsif new.organization_id is not null then
      v_decision := public.fraud_decide_subject('organizer',new.organization_id::text);
      if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:organizer'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.guard_experience_publication() from public, anon, authenticated;
drop trigger if exists fraud_guard_experience_publication on public.experiences;
create trigger fraud_guard_experience_publication
before update of status, searchable on public.experiences
for each row execute function fraud_internal.guard_experience_publication();

create or replace function fraud_internal.guard_event_ticket_order_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_event public.events;
  v_decision jsonb;
begin
  select * into v_event from public.events where id=new.event_id;
  if v_event.id is null then return new; end if;
  v_decision := public.fraud_decide_subject('event',v_event.id::text);
  if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:event'; end if;
  if v_event.location_id is not null then
    v_decision := public.fraud_decide_subject('location',v_event.location_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:location'; end if;
  elsif v_event.organization_id is not null then
    v_decision := public.fraud_decide_subject('organizer',v_event.organization_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:organizer'; end if;
  end if;
  if new.provider_account_id is not null and btrim(new.provider_account_id) <> '' then
    v_decision := public.fraud_decide_subject('payout','connect-account:' || new.provider_account_id);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:payout'; end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.guard_event_ticket_order_insert() from public, anon, authenticated;
drop trigger if exists fraud_guard_event_ticket_order_insert on public.event_ticket_orders;
create trigger fraud_guard_event_ticket_order_insert
before insert on public.event_ticket_orders
for each row execute function fraud_internal.guard_event_ticket_order_insert();

create or replace function fraud_internal.guard_experience_booking_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, fraud_internal
as $$
declare
  v_experience public.experiences;
  v_decision jsonb;
begin
  select * into v_experience from public.experiences where id=new.experience_id;
  if v_experience.id is null then return new; end if;
  v_decision := public.fraud_decide_subject('experience',v_experience.id::text);
  if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:experience'; end if;
  if v_experience.location_id is not null then
    v_decision := public.fraud_decide_subject('location',v_experience.location_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:location'; end if;
  elsif v_experience.organization_id is not null then
    v_decision := public.fraud_decide_subject('organizer',v_experience.organization_id::text);
    if fraud_internal.decision_blocks_sensitive_action(v_decision) then raise exception 'fraud_review_required:organizer'; end if;
  end if;
  return new;
end;
$$;
revoke all on function fraud_internal.guard_experience_booking_insert() from public, anon, authenticated;
drop trigger if exists fraud_guard_experience_booking_insert on public.experience_bookings;
create trigger fraud_guard_experience_booking_insert
before insert on public.experience_bookings
for each row execute function fraud_internal.guard_experience_booking_insert();
