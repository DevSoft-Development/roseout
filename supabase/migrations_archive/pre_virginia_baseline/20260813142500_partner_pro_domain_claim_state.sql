create table if not exists public.domain_registration_operations (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  domain_name text not null,
  idempotency_key text not null unique,
  status text not null check (status in ('reserved','registering','active','failed')),
  gateway_order_id text,
  gateway_response_code text,
  gateway_expiration_date timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists domain_registration_operations_location_idx
  on public.domain_registration_operations(location_id, created_at desc);

create unique index if not exists domain_registration_operations_active_location_idx
  on public.domain_registration_operations(location_id)
  where status in ('reserved','registering','active');

create unique index if not exists domain_registration_operations_active_domain_idx
  on public.domain_registration_operations(lower(domain_name))
  where status in ('reserved','registering','active');

create or replace function public.reserve_partner_pro_included_domain(
  p_location_id uuid,
  p_domain_name text,
  p_idempotency_key text
)
returns public.domain_registration_operations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_location public.locations%rowtype;
  v_existing public.domain_registration_operations%rowtype;
  v_operation public.domain_registration_operations%rowtype;
  v_domain text := lower(trim(p_domain_name));
begin
  if v_domain is null or v_domain = '' then
    raise exception 'invalid_domain';
  end if;

  select * into v_existing
  from public.domain_registration_operations
  where idempotency_key = p_idempotency_key;

  if found then
    if v_existing.location_id <> p_location_id or lower(v_existing.domain_name) <> v_domain then
      raise exception 'idempotency_key_reused';
    end if;
    return v_existing;
  end if;

  select * into v_location
  from public.locations
  where id = p_location_id
  for update;

  if not found then
    raise exception 'location_not_found';
  end if;

  if lower(coalesce(v_location.subscription_plan, '')) <> 'business_pro'
     or lower(coalesce(v_location.subscription_status, '')) not in ('active','trialing') then
    raise exception 'partner_pro_required';
  end if;

  if v_location.included_domain_claimed_at is not null
     and v_location.included_domain_name is not null
     and lower(v_location.included_domain_name) <> v_domain then
    raise exception 'included_domain_already_claimed';
  end if;

  select * into v_existing
  from public.domain_registration_operations
  where location_id = p_location_id
    and status in ('reserved','registering','active')
  order by created_at desc
  limit 1;

  if found then
    if lower(v_existing.domain_name) <> v_domain then
      raise exception 'domain_claim_in_progress';
    end if;
    return v_existing;
  end if;

  insert into public.domain_registration_operations (
    location_id, domain_name, idempotency_key, status
  ) values (
    p_location_id, v_domain, p_idempotency_key, 'reserved'
  )
  returning * into v_operation;

  update public.locations
  set included_domain_name = coalesce(included_domain_name, v_domain),
      included_domain_status = 'pending'
  where id = p_location_id;

  return v_operation;
end;
$$;

create or replace function public.complete_partner_pro_included_domain(
  p_operation_id uuid,
  p_gateway_order_id text,
  p_gateway_response_code text,
  p_gateway_expiration_date timestamptz
)
returns public.domain_registration_operations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.domain_registration_operations%rowtype;
begin
  select * into v_operation
  from public.domain_registration_operations
  where id = p_operation_id
  for update;

  if not found then
    raise exception 'operation_not_found';
  end if;

  if v_operation.status = 'active' then
    return v_operation;
  end if;

  update public.domain_registration_operations
  set status = 'active',
      gateway_order_id = p_gateway_order_id,
      gateway_response_code = p_gateway_response_code,
      gateway_expiration_date = p_gateway_expiration_date,
      error_code = null,
      updated_at = now()
  where id = p_operation_id
  returning * into v_operation;

  update public.locations
  set included_domain_name = v_operation.domain_name,
      included_domain_claimed_at = coalesce(included_domain_claimed_at, now()),
      included_domain_status = 'active',
      included_domain_registered_at = coalesce(included_domain_registered_at, now()),
      included_domain_renewal_due_at = p_gateway_expiration_date
  where id = v_operation.location_id;

  return v_operation;
end;
$$;

create or replace function public.fail_partner_pro_included_domain(
  p_operation_id uuid,
  p_error_code text
)
returns public.domain_registration_operations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_operation public.domain_registration_operations%rowtype;
begin
  update public.domain_registration_operations
  set status = 'failed',
      error_code = p_error_code,
      updated_at = now()
  where id = p_operation_id
    and status <> 'active'
  returning * into v_operation;

  if not found then
    select * into v_operation
    from public.domain_registration_operations
    where id = p_operation_id;
  end if;

  if v_operation.id is null then
    raise exception 'operation_not_found';
  end if;

  if v_operation.status = 'failed' then
    update public.locations
    set included_domain_name = case when included_domain_claimed_at is null then null else included_domain_name end,
        included_domain_status = case when included_domain_claimed_at is null then null else included_domain_status end
    where id = v_operation.location_id;
  end if;

  return v_operation;
end;
$$;

revoke all on function public.reserve_partner_pro_included_domain(uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_partner_pro_included_domain(uuid, text, text, timestamptz) from public, anon, authenticated;
revoke all on function public.fail_partner_pro_included_domain(uuid, text) from public, anon, authenticated;

grant execute on function public.reserve_partner_pro_included_domain(uuid, text, text) to service_role;
grant execute on function public.complete_partner_pro_included_domain(uuid, text, text, timestamptz) to service_role;
grant execute on function public.fail_partner_pro_included_domain(uuid, text) to service_role;
