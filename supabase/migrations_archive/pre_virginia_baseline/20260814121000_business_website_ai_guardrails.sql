-- Canonical AI guardrails for the active business_websites model.
-- Keeps AI image generation disabled, allows one initial build, two monthly
-- full redesigns, one concurrent generation, and a $5/location monthly ceiling.

create table if not exists public.business_website_ai_policy (
  location_id uuid primary key references public.locations(id) on delete cascade,
  initial_builds_included integer not null default 1 check (initial_builds_included >= 0),
  full_redesigns_per_month integer not null default 2 check (full_redesigns_per_month >= 0),
  max_concurrent_generations integer not null default 1 check (max_concurrent_generations >= 1),
  max_estimated_cost_micros_per_location_month bigint not null default 5000000 check (max_estimated_cost_micros_per_location_month >= 0),
  ai_image_generation_enabled boolean not null default false check (ai_image_generation_enabled = false),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists business_website_ai_usage_location_month_idx
  on public.business_website_ai_usage(location_id, created_at desc);

create index if not exists business_website_ai_usage_running_idx
  on public.business_website_ai_usage(location_id, status)
  where status = 'running';

alter table public.business_website_ai_policy enable row level security;

revoke all on public.business_website_ai_policy from anon, authenticated;
grant all on public.business_website_ai_policy to service_role;

create or replace function public.get_location_website_ai_quota(p_location_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.business_website_ai_policy%rowtype;
  v_month_start timestamptz := date_trunc('month', now());
  v_running integer := 0;
  v_initial integer := 0;
  v_redesign integer := 0;
  v_cost bigint := 0;
begin
  insert into public.business_website_ai_policy(location_id)
  values (p_location_id)
  on conflict (location_id) do nothing;

  select * into v_policy
  from public.business_website_ai_policy
  where location_id = p_location_id;

  select count(*) into v_running
  from public.business_website_ai_usage
  where location_id = p_location_id and status = 'running';

  select count(*) into v_initial
  from public.business_website_ai_usage
  where location_id = p_location_id
    and generation_type = 'initial_build'
    and status = 'succeeded';

  select count(*) into v_redesign
  from public.business_website_ai_usage
  where location_id = p_location_id
    and generation_type = 'full_redesign'
    and status = 'succeeded'
    and created_at >= v_month_start;

  select coalesce(sum(estimated_cost_micros), 0)::bigint into v_cost
  from public.business_website_ai_usage
  where location_id = p_location_id
    and status in ('running', 'succeeded')
    and created_at >= v_month_start;

  return jsonb_build_object(
    'initial_builds_included', v_policy.initial_builds_included,
    'initial_builds_used', v_initial,
    'initial_build_available', v_initial < v_policy.initial_builds_included,
    'full_redesigns_per_month', v_policy.full_redesigns_per_month,
    'full_redesigns_used_this_month', v_redesign,
    'full_redesign_available', v_redesign < v_policy.full_redesigns_per_month,
    'max_concurrent_generations', v_policy.max_concurrent_generations,
    'running_generations', v_running,
    'monthly_cost_ceiling_micros', v_policy.max_estimated_cost_micros_per_location_month,
    'monthly_cost_used_micros', v_cost,
    'monthly_cost_remaining_micros', greatest(v_policy.max_estimated_cost_micros_per_location_month - v_cost, 0),
    'ai_image_generation_enabled', false
  );
end;
$$;

create or replace function public.begin_location_website_ai_generation(
  p_location_id uuid,
  p_generation_type text,
  p_provider text,
  p_model text,
  p_request_key text,
  p_estimated_cost_micros bigint
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_policy public.business_website_ai_policy%rowtype;
  v_website_id uuid;
  v_month_start timestamptz := date_trunc('month', now());
  v_running integer := 0;
  v_initial integer := 0;
  v_redesign integer := 0;
  v_cost bigint := 0;
  v_usage_id uuid;
begin
  if p_generation_type not in ('design_match', 'initial_build', 'full_redesign', 'section_rewrite', 'seo_copy') then
    raise exception 'website_ai_generation_type_not_allowed';
  end if;

  if coalesce(p_estimated_cost_micros, 0) < 0 then
    raise exception 'website_ai_invalid_cost_estimate';
  end if;

  insert into public.business_website_ai_policy(location_id)
  values (p_location_id)
  on conflict (location_id) do nothing;

  select * into v_policy
  from public.business_website_ai_policy
  where location_id = p_location_id
  for update;

  select id into v_website_id
  from public.business_websites
  where location_id = p_location_id
  limit 1;

  if v_website_id is null then
    raise exception 'website_ai_website_not_found';
  end if;

  select count(*) into v_running
  from public.business_website_ai_usage
  where location_id = p_location_id and status = 'running';

  if v_running >= v_policy.max_concurrent_generations then
    raise exception 'website_ai_generation_already_running';
  end if;

  if p_generation_type = 'initial_build' then
    select count(*) into v_initial
    from public.business_website_ai_usage
    where location_id = p_location_id
      and generation_type = 'initial_build'
      and status = 'succeeded';
    if v_initial >= v_policy.initial_builds_included then
      raise exception 'website_ai_initial_build_limit_reached';
    end if;
  end if;

  if p_generation_type = 'full_redesign' then
    select count(*) into v_redesign
    from public.business_website_ai_usage
    where location_id = p_location_id
      and generation_type = 'full_redesign'
      and status = 'succeeded'
      and created_at >= v_month_start;
    if v_redesign >= v_policy.full_redesigns_per_month then
      raise exception 'website_ai_redesign_limit_reached';
    end if;
  end if;

  select coalesce(sum(estimated_cost_micros), 0)::bigint into v_cost
  from public.business_website_ai_usage
  where location_id = p_location_id
    and status in ('running', 'succeeded')
    and created_at >= v_month_start;

  if v_cost + coalesce(p_estimated_cost_micros, 0) > v_policy.max_estimated_cost_micros_per_location_month then
    raise exception 'website_ai_monthly_cost_limit_reached';
  end if;

  insert into public.business_website_ai_usage(
    website_id,
    location_id,
    generation_type,
    status,
    provider,
    model,
    request_key,
    estimated_cost_micros
  ) values (
    v_website_id,
    p_location_id,
    p_generation_type,
    'running',
    nullif(p_provider, ''),
    nullif(p_model, ''),
    nullif(p_request_key, ''),
    coalesce(p_estimated_cost_micros, 0)
  )
  returning id into v_usage_id;

  return v_usage_id;
end;
$$;

create or replace function public.finish_location_website_ai_generation(
  p_usage_id uuid,
  p_status text,
  p_input_tokens integer,
  p_output_tokens integer,
  p_actual_cost_micros bigint,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'website_ai_invalid_finish_status';
  end if;

  update public.business_website_ai_usage
  set status = p_status,
      input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
      output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
      estimated_cost_micros = greatest(coalesce(p_actual_cost_micros, 0), 0),
      error_code = nullif(p_error_code, ''),
      completed_at = now()
  where id = p_usage_id and status = 'running';
end;
$$;

revoke all on function public.get_location_website_ai_quota(uuid) from public, anon, authenticated;
revoke all on function public.begin_location_website_ai_generation(uuid,text,text,text,text,bigint) from public, anon, authenticated;
revoke all on function public.finish_location_website_ai_generation(uuid,text,integer,integer,bigint,text) from public, anon, authenticated;

grant execute on function public.get_location_website_ai_quota(uuid) to service_role;
grant execute on function public.begin_location_website_ai_generation(uuid,text,text,text,text,bigint) to service_role;
grant execute on function public.finish_location_website_ai_generation(uuid,text,integer,integer,bigint,text) to service_role;
