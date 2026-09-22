-- Wire canonical ZIP geography into auth sync, search telemetry, and primary CRM territories.

create or replace function public.sync_consumer_profile_from_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  month_value smallint := null;
  consent_copy text := nullif(trim(meta ->> 'sms_consent_text'), '');
  consent_value boolean := false;
begin
  if coalesce(meta ->> 'birth_month', '') ~ '^(?:[1-9]|1[0-2])$' then
    month_value := (meta ->> 'birth_month')::smallint;
  end if;

  consent_value :=
    coalesce((meta ->> 'sms_consent')::boolean, false)
    and consent_copy is not null;

  insert into public.consumer_profiles (
    user_id,
    first_name,
    phone_e164,
    birth_month,
    home_zip_code,
    sms_consent,
    sms_consent_at,
    sms_consent_source,
    sms_consent_text,
    updated_at
  )
  values (
    new.id,
    nullif(trim(meta ->> 'first_name'), ''),
    nullif(trim(meta ->> 'phone_e164'), ''),
    month_value,
    public.normalize_zip5(meta ->> 'home_zip_code'),
    consent_value,
    case when consent_value then now() else null end,
    case when consent_value then 'mobile_account_signup' else null end,
    case when consent_value then consent_copy else null end,
    now()
  )
  on conflict (user_id) do update set
    first_name = coalesce(excluded.first_name, consumer_profiles.first_name),
    phone_e164 = coalesce(excluded.phone_e164, consumer_profiles.phone_e164),
    birth_month = coalesce(excluded.birth_month, consumer_profiles.birth_month),
    home_zip_code = coalesce(excluded.home_zip_code, consumer_profiles.home_zip_code),
    sms_consent = excluded.sms_consent,
    sms_consent_at = case
      when excluded.sms_consent and consumer_profiles.sms_consent_at is null then now()
      when excluded.sms_consent then consumer_profiles.sms_consent_at
      else null
    end,
    sms_consent_source = case when excluded.sms_consent then 'mobile_account_signup' else null end,
    sms_consent_text = case when excluded.sms_consent then excluded.sms_consent_text else null end,
    updated_at = now();

  return new;
end;
$$;

alter table public.search_events
  add column if not exists zip_code text,
  add column if not exists county text,
  add column if not exists geo_source text,
  add column if not exists resolved_market text;

create index if not exists search_events_zip_created_idx
  on public.search_events(zip_code, created_at desc);
create index if not exists search_events_geo_source_created_idx
  on public.search_events(geo_source, created_at desc);
create index if not exists search_events_resolved_market_created_idx
  on public.search_events(resolved_market, created_at desc);

create or replace function public.crm_scope_priority(p_scope_type text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_scope_type
    when 'zip' then 800
    when 'neighborhood' then 700
    when 'city' then 650
    when 'town' then 650
    when 'borough' then 600
    when 'county' then 550
    when 'state' then 400
    when 'market' then 300
    else 0
  end;
$$;

create or replace function public.crm_sync_location_primary_territory(p_location_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  existing_manual boolean;
  winning_territory uuid;
  winning_scope_type text;
  winning_scope_value text;
  winning_priority integer;
begin
  select manual_override
  into existing_manual
  from public.crm_location_primary_territories
  where location_id = p_location_id;

  if coalesce(existing_manual, false) then
    return;
  end if;

  select
    t.id,
    best.scope_type,
    best.scope_value,
    public.crm_scope_priority(best.scope_type)
  into
    winning_territory,
    winning_scope_type,
    winning_scope_value,
    winning_priority
  from public.crm_territories t
  cross join lateral (
    select s.scope_type, s.scope_value
    from public.crm_territory_scopes s
    where s.territory_id = t.id
    order by public.crm_scope_priority(s.scope_type) desc, s.scope_value asc
    limit 1
  ) best
  where t.status = 'active'
    and public.crm_location_matches_territory(p_location_id, t.id)
  order by
    public.crm_scope_priority(best.scope_type) desc,
    (
      select count(distinct s2.scope_type)
      from public.crm_territory_scopes s2
      where s2.territory_id = t.id
    ) desc,
    t.id
  limit 1;

  if winning_territory is null then
    delete from public.crm_location_primary_territories
    where location_id = p_location_id
      and manual_override = false;
    return;
  end if;

  insert into public.crm_location_primary_territories (
    location_id,
    territory_id,
    assignment_source,
    matched_scope_type,
    matched_scope_value,
    assignment_priority,
    manual_override,
    assigned_at,
    updated_at
  )
  values (
    p_location_id,
    winning_territory,
    'automatic',
    winning_scope_type,
    winning_scope_value,
    winning_priority,
    false,
    now(),
    now()
  )
  on conflict (location_id) do update set
    territory_id = excluded.territory_id,
    assignment_source = 'automatic',
    matched_scope_type = excluded.matched_scope_type,
    matched_scope_value = excluded.matched_scope_value,
    assignment_priority = excluded.assignment_priority,
    manual_override = false,
    updated_at = now()
  where public.crm_location_primary_territories.manual_override = false;
end;
$$;

create or replace function public.trg_locations_sync_primary_territory()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.crm_sync_location_primary_territory(new.id);
  return new;
end;
$$;

drop trigger if exists trg_locations_sync_primary_territory on public.locations;
create trigger trg_locations_sync_primary_territory
after insert or update of market,state,city,zip_code,postal_code,borough,neighborhood,county,latitude,longitude
on public.locations
for each row execute function public.trg_locations_sync_primary_territory();

create or replace function public.trg_territory_scope_primary_resync()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  r record;
begin
  for r in select id from public.locations loop
    perform public.crm_sync_location_primary_territory(r.id);
  end loop;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_crm_territory_scopes_primary_resync on public.crm_territory_scopes;
create trigger trg_crm_territory_scopes_primary_resync
after insert or update or delete on public.crm_territory_scopes
for each row execute function public.trg_territory_scope_primary_resync();

-- Initialize primary territory state for current inventory.
do $$
declare
  r record;
begin
  for r in select id from public.locations loop
    perform public.crm_sync_location_primary_territory(r.id);
  end loop;
end;
$$;

grant execute on function public.crm_scope_priority(text) to service_role;
grant execute on function public.crm_sync_location_primary_territory(uuid) to service_role;
