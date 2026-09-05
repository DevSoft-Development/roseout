-- Canonical per-location Location Intelligence lifecycle state.
-- This is intentionally server-only. Publication remains controlled by the
-- existing guarded dedupe + cleanup pipeline.

create table if not exists public.location_intelligence_state (
  location_id uuid primary key references public.locations(id) on delete cascade,
  lifecycle_status text not null default 'pending'
    check (lifecycle_status in ('pending','running','review','blocked','failed','complete')),
  current_stage text not null default 'intake'
    check (current_stage in (
      'intake','normalize','google_identity','google_details','website','reservations',
      'photos','classification','search_profile','dedupe','publishability','complete'
    )),
  stage_statuses jsonb not null default '{}'::jsonb,
  stage_attempts jsonb not null default '{}'::jsonb,
  last_error_code text,
  last_error text,
  next_retry_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  last_transition_at timestamptz not null default now(),
  source_precedence_version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists location_intelligence_state_status_idx
  on public.location_intelligence_state(lifecycle_status, current_stage, updated_at desc);
create index if not exists location_intelligence_state_retry_idx
  on public.location_intelligence_state(next_retry_at)
  where next_retry_at is not null and lifecycle_status in ('pending','running','blocked','failed');

create table if not exists public.location_intelligence_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  stage text not null,
  event_type text not null,
  status text,
  error_code text,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists location_intelligence_events_location_idx
  on public.location_intelligence_events(location_id, created_at desc);

alter table public.location_intelligence_state enable row level security;
alter table public.location_intelligence_events enable row level security;

revoke all on table public.location_intelligence_state from public, anon, authenticated;
revoke all on table public.location_intelligence_events from public, anon, authenticated;
grant select, insert, update, delete on table public.location_intelligence_state to service_role;
grant select, insert on table public.location_intelligence_events to service_role;

create or replace function public.record_location_intelligence_stage(
  p_location_id uuid,
  p_stage text,
  p_status text,
  p_event_type text default 'stage_transition',
  p_error_code text default null,
  p_error text default null,
  p_next_retry_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.location_intelligence_state
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_state public.location_intelligence_state;
  v_lifecycle_status text;
begin
  if p_stage not in (
    'intake','normalize','google_identity','google_details','website','reservations',
    'photos','classification','search_profile','dedupe','publishability','complete'
  ) then
    raise exception 'Unsupported Location Intelligence stage: %', p_stage;
  end if;

  if p_status not in ('pending','running','completed','review','blocked','failed','skipped') then
    raise exception 'Unsupported Location Intelligence stage status: %', p_status;
  end if;

  v_lifecycle_status := case
    when p_stage = 'complete' and p_status = 'completed' then 'complete'
    when p_status = 'review' then 'review'
    when p_status = 'blocked' then 'blocked'
    when p_status = 'failed' then 'failed'
    when p_status = 'pending' then 'pending'
    else 'running'
  end;

  insert into public.location_intelligence_state(
    location_id,
    lifecycle_status,
    current_stage,
    stage_statuses,
    stage_attempts,
    last_error_code,
    last_error,
    next_retry_at,
    started_at,
    completed_at,
    last_transition_at,
    updated_at
  )
  values (
    p_location_id,
    v_lifecycle_status,
    p_stage,
    jsonb_build_object(p_stage, jsonb_build_object(
      'status', p_status,
      'updatedAt', clock_timestamp(),
      'errorCode', p_error_code
    )),
    jsonb_build_object(p_stage, case when p_status = 'running' then 1 else 0 end),
    p_error_code,
    p_error,
    p_next_retry_at,
    case when p_status = 'running' then clock_timestamp() else null end,
    case when v_lifecycle_status = 'complete' then clock_timestamp() else null end,
    clock_timestamp(),
    clock_timestamp()
  )
  on conflict (location_id) do update
  set lifecycle_status = excluded.lifecycle_status,
      current_stage = excluded.current_stage,
      stage_statuses = coalesce(public.location_intelligence_state.stage_statuses, '{}'::jsonb)
        || excluded.stage_statuses,
      stage_attempts = case
        when p_status = 'running' then jsonb_set(
          coalesce(public.location_intelligence_state.stage_attempts, '{}'::jsonb),
          array[p_stage],
          to_jsonb(coalesce((public.location_intelligence_state.stage_attempts ->> p_stage)::integer, 0) + 1),
          true
        )
        else public.location_intelligence_state.stage_attempts
      end,
      last_error_code = p_error_code,
      last_error = p_error,
      next_retry_at = p_next_retry_at,
      started_at = coalesce(public.location_intelligence_state.started_at,
        case when p_status = 'running' then clock_timestamp() else null end),
      completed_at = case
        when v_lifecycle_status = 'complete' then clock_timestamp()
        else null
      end,
      last_transition_at = clock_timestamp(),
      updated_at = clock_timestamp()
  returning * into v_state;

  insert into public.location_intelligence_events(
    location_id, stage, event_type, status, error_code, message, metadata
  ) values (
    p_location_id, p_stage, p_event_type, p_status, p_error_code, p_error, coalesce(p_metadata, '{}'::jsonb)
  );

  return v_state;
end;
$$;

revoke all on function public.record_location_intelligence_stage(uuid,text,text,text,text,text,timestamptz,jsonb)
  from public, anon, authenticated;
grant execute on function public.record_location_intelligence_stage(uuid,text,text,text,text,text,timestamptz,jsonb)
  to service_role;

comment on table public.location_intelligence_state is
  'Canonical per-location lifecycle state for the Location Intelligence pipeline.';
comment on table public.location_intelligence_events is
  'Append-only operational history for Location Intelligence stage transitions.';
