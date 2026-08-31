alter table public.search_ranking_rollout_stages
  add column if not exists audience_type text;

update public.search_ranking_rollout_stages
set audience_type = case
  when stage_key = 'disabled' then 'disabled'
  when stage_key in ('admin_shadow', 'admin_5', 'admin_25') then 'admin'
  when stage_key = 'internal_5' then 'internal'
  else 'public'
end
where audience_type is null;

alter table public.search_ranking_rollout_stages
  alter column audience_type set not null;

alter table public.search_ranking_rollout_stages
  drop constraint if exists search_ranking_rollout_stages_audience_type_check;

alter table public.search_ranking_rollout_stages
  add constraint search_ranking_rollout_stages_audience_type_check
  check (audience_type in ('disabled','admin','internal','public'));

create table if not exists public.search_ranking_internal_cohort (
  user_id uuid primary key,
  enabled boolean not null default true,
  reason text,
  added_by uuid,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists search_ranking_internal_cohort_active_idx
  on public.search_ranking_internal_cohort (enabled, expires_at);

alter table public.search_ranking_internal_cohort enable row level security;
revoke all on public.search_ranking_internal_cohort from anon, authenticated;
grant all on public.search_ranking_internal_cohort to service_role;

create or replace function public.activate_search_ranking_stage(
  target_stage_key text,
  actor_user_id uuid,
  reason text,
  force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_state public.search_ranking_rollout_stage_state%rowtype;
  current_stage public.search_ranking_rollout_stages%rowtype;
  target_stage public.search_ranking_rollout_stages%rowtype;
  readiness public.search_ranking_rollout_readiness_v1%rowtype;
  unacked_rollbacks integer := 0;
  active_internal_members integer := 0;
  change_kind text;
begin
  select * into current_state
  from public.search_ranking_rollout_stage_state
  where id = true
  for update;

  select * into current_stage
  from public.search_ranking_rollout_stages
  where stage_key = current_state.stage_key;

  select * into target_stage
  from public.search_ranking_rollout_stages
  where stage_key = target_stage_key and enabled = true;

  if not found then
    raise exception 'Unknown or disabled rollout stage: %', target_stage_key;
  end if;

  if target_stage.automatic_promotion_allowed then
    raise exception 'Automatic promotion is not allowed';
  end if;

  if target_stage.sort_order > current_stage.sort_order + 10 and not force then
    raise exception 'Cannot skip rollout stages';
  end if;

  select * into readiness
  from public.search_ranking_rollout_readiness_v1
  limit 1;

  select count(*) into unacked_rollbacks
  from public.search_ranking_rollout_events
  where event_type = 'automatic_rollback'
    and created_at > coalesce((
      select max(created_at)
      from public.search_ranking_rollout_events
      where event_type = 'acknowledged'
    ), '-infinity'::timestamptz);

  if target_stage.sort_order > current_stage.sort_order and not force then
    if coalesce(readiness.ready_to_promote, false) = false then
      raise exception 'Current stage is not ready to promote';
    end if;
    if coalesce(current_state.last_decision, '') <> 'healthy' then
      raise exception 'Latest guardrail decision is not healthy';
    end if;
    if unacked_rollbacks > 0 then
      raise exception 'An automatic rollback must be acknowledged first';
    end if;
  end if;

  if target_stage.audience_type = 'internal' then
    select count(*) into active_internal_members
    from public.search_ranking_internal_cohort
    where enabled = true
      and (expires_at is null or expires_at > now());
    if active_internal_members = 0 then
      raise exception 'Internal rollout requires at least one active cohort member';
    end if;
  end if;

  change_kind := case
    when target_stage.sort_order > current_stage.sort_order then 'manual_promotion'
    when target_stage.sort_order < current_stage.sort_order then 'manual_demotion'
    else 'initialization'
  end;

  update public.search_ranking_rollout_stage_state
  set stage_key = target_stage.stage_key,
      stage_started_at = now(),
      automatic_promotion_enabled = false,
      last_decision = null,
      last_decision_reasons = '{}',
      updated_by = actor_user_id,
      updated_at = now()
  where id = true;

  update public.search_ranking_rollout_settings
  set enabled = target_stage.rollout_percent > 0,
      rollout_percent = target_stage.rollout_percent,
      admin_only = target_stage.audience_type = 'admin',
      shadow_test_enabled = target_stage.stage_key = 'admin_shadow',
      eligible_markets = target_stage.eligible_markets,
      updated_by = actor_user_id,
      updated_at = now()
  where id = true;

  update public.search_ranking_guardrail_settings
  set enabled = target_stage.rollout_percent > 0,
      updated_by = actor_user_id,
      updated_at = now()
  where id = true;

  insert into public.search_ranking_rollout_stage_history (
    from_stage_key, to_stage_key, change_type, reason, changed_by
  ) values (
    current_stage.stage_key, target_stage.stage_key, change_kind, reason, actor_user_id
  );

  return jsonb_build_object(
    'stage_key', target_stage.stage_key,
    'audience_type', target_stage.audience_type,
    'rollout_percent', target_stage.rollout_percent,
    'enabled', target_stage.rollout_percent > 0,
    'shadow_test_enabled', target_stage.stage_key = 'admin_shadow'
  );
end;
$$;

create or replace function public.disable_search_ranking_rollout(
  actor_user_id uuid,
  reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_stage text;
begin
  select stage_key into previous_stage
  from public.search_ranking_rollout_stage_state
  where id = true
  for update;

  update public.search_ranking_rollout_stage_state
  set stage_key = 'disabled',
      stage_started_at = now(),
      automatic_promotion_enabled = false,
      last_decision = 'disabled',
      last_decision_reasons = array[coalesce(reason, 'Emergency disable')],
      updated_by = actor_user_id,
      updated_at = now()
  where id = true;

  update public.search_ranking_rollout_settings
  set enabled = false,
      rollout_percent = 0,
      admin_only = true,
      shadow_test_enabled = false,
      updated_by = actor_user_id,
      updated_at = now()
  where id = true;

  update public.search_ranking_guardrail_settings
  set enabled = false,
      updated_by = actor_user_id,
      updated_at = now()
  where id = true;

  insert into public.search_ranking_rollout_stage_history (
    from_stage_key, to_stage_key, change_type, reason, changed_by
  ) values (
    previous_stage, 'disabled', 'manual_demotion', reason, actor_user_id
  );

  insert into public.search_ranking_rollout_events (
    event_type, status, reason, metadata
  ) values (
    'manual_disable', 'rollback', reason,
    jsonb_build_object('from_stage', previous_stage, 'actor_user_id', actor_user_id)
  );

  return jsonb_build_object(
    'stage_key', 'disabled',
    'enabled', false,
    'rollout_percent', 0,
    'shadow_test_enabled', false,
    'guardrails_enabled', false
  );
end;
$$;

revoke all on function public.activate_search_ranking_stage(text, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.disable_search_ranking_rollout(uuid, text) from public, anon, authenticated;
grant execute on function public.activate_search_ranking_stage(text, uuid, text, boolean) to service_role;
grant execute on function public.disable_search_ranking_rollout(uuid, text) to service_role;

update public.search_ranking_rollout_stage_state
set stage_key = 'disabled',
    automatic_promotion_enabled = false,
    updated_at = now()
where id = true;

update public.search_ranking_rollout_settings
set enabled = false,
    rollout_percent = 0,
    admin_only = true,
    shadow_test_enabled = false,
    updated_at = now()
where id = true;

update public.search_ranking_guardrail_settings
set enabled = false,
    updated_at = now()
where id = true;
