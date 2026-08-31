-- Delegated CRM territory hierarchy and automatic location assignment.
-- Root ownership remains with the superadmin; managers may delegate access downward.

create table if not exists public.crm_territory_settings (
  id uuid primary key default gen_random_uuid(),
  root_owner_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_territory_access (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references public.crm_territories(id) on delete cascade,
  user_id uuid not null,
  access_level text not null check (access_level in ('owner','manager','area_manager','ambassador','viewer')),
  granted_by_user_id uuid,
  parent_access_id uuid references public.crm_territory_access(id) on delete set null,
  can_delegate boolean not null default false,
  status text not null default 'active' check (status in ('active','revoked')),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists crm_territory_access_active_unique
  on public.crm_territory_access(territory_id,user_id)
  where status='active';
create index if not exists crm_territory_access_user_idx on public.crm_territory_access(user_id,status);
create index if not exists crm_territory_access_territory_idx on public.crm_territory_access(territory_id,status);

create table if not exists public.crm_territory_scopes (
  id uuid primary key default gen_random_uuid(),
  territory_id uuid not null references public.crm_territories(id) on delete cascade,
  scope_type text not null check (scope_type in ('market','state','city','town','zip','borough','neighborhood')),
  scope_value text not null,
  normalized_value text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists crm_territory_scopes_unique
  on public.crm_territory_scopes(territory_id,scope_type,normalized_value);
create index if not exists crm_territory_scopes_lookup_idx
  on public.crm_territory_scopes(scope_type,normalized_value,territory_id);

create or replace function public.crm_territory_access_rank(p_level text)
returns integer
language sql
immutable
set search_path = public
as $$
  select case p_level
    when 'owner' then 50
    when 'manager' then 40
    when 'area_manager' then 30
    when 'ambassador' then 20
    when 'viewer' then 10
    else 0 end;
$$;

create or replace function public.crm_can_delegate_territory_access(p_granter uuid, p_territory uuid, p_target_level text)
returns boolean
language sql
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.crm_territory_settings s
    where s.root_owner_user_id = p_granter
  ) or exists (
    select 1
    from public.crm_territory_access a
    where a.territory_id = p_territory
      and a.user_id = p_granter
      and a.status = 'active'
      and a.can_delegate
      and public.crm_territory_access_rank(a.access_level) > public.crm_territory_access_rank(p_target_level)
  );
$$;

-- Existing and future territories always remain owned by the configured root owner.
create or replace function public.crm_enforce_root_territory_owner()
returns trigger
language plpgsql
set search_path = public
as $$
declare root_user uuid;
begin
  select root_owner_user_id into root_user from public.crm_territory_settings limit 1;
  if root_user is not null then new.owner_user_id := root_user; end if;
  return new;
end;
$$;

drop trigger if exists trg_crm_territories_root_owner on public.crm_territories;
create trigger trg_crm_territories_root_owner
before insert or update of owner_user_id on public.crm_territories
for each row execute function public.crm_enforce_root_territory_owner();

create or replace function public.crm_location_matches_territory(p_location_id uuid, p_territory_id uuid)
returns boolean
language plpgsql
stable
set search_path = public
as $$
declare
  loc record;
  scope_type_row record;
begin
  select
    lower(trim(coalesce(market,''))) as market,
    lower(trim(coalesce(state,''))) as state,
    lower(trim(coalesce(city,''))) as city,
    lower(trim(coalesce(zip_code, postal_code, ''))) as zip,
    lower(trim(coalesce(borough,''))) as borough,
    lower(trim(coalesce(neighborhood,''))) as neighborhood
  into loc from public.locations where id = p_location_id;
  if not found then return false; end if;

  for scope_type_row in
    select distinct scope_type from public.crm_territory_scopes where territory_id = p_territory_id
  loop
    if not exists (
      select 1
      from public.crm_territory_scopes s
      where s.territory_id = p_territory_id
        and s.scope_type = scope_type_row.scope_type
        and lower(trim(s.normalized_value)) = case s.scope_type
          when 'market' then loc.market
          when 'state' then loc.state
          when 'city' then loc.city
          when 'town' then loc.city
          when 'zip' then loc.zip
          when 'borough' then loc.borough
          when 'neighborhood' then loc.neighborhood
          else '__unsupported__'
        end
    ) then return false; end if;
  end loop;
  return true;
end;
$$;

create or replace function public.crm_sync_location_territory_assignments(p_location_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  root_user uuid;
  root_member uuid;
  terr record;
  access_row record;
begin
  select root_owner_user_id into root_user from public.crm_territory_settings limit 1;

  if root_user is not null then
    select id into root_member
    from public.team_member_profiles
    where user_id = root_user and status in ('active','training')
    limit 1;

    if root_member is not null then
      insert into public.team_location_assignments(location_id,team_member_id,assigned_by,assignment_type,priority,status,reason,campaign,updated_at)
      values (p_location_id,root_member,root_user,'territory_auto','normal','active','Automatic root territory ownership','territory_auto',now())
      on conflict (location_id,team_member_id,assignment_type) where status='active'
      do update set updated_at=excluded.updated_at;
    end if;
  end if;

  for terr in
    select t.id,t.owner_user_id
    from public.crm_territories t
    where t.status='active' and public.crm_location_matches_territory(p_location_id,t.id)
  loop
    for access_row in
      select a.user_id from public.crm_territory_access a
      where a.territory_id=terr.id and a.status='active'
      union
      select terr.owner_user_id where terr.owner_user_id is not null
    loop
      insert into public.team_location_assignments(location_id,team_member_id,assigned_by,assignment_type,priority,status,reason,campaign,updated_at)
      select p_location_id,tmp.id,coalesce(root_user,access_row.user_id),'territory_auto','normal','active','Automatic territory match','territory_auto',now()
      from public.team_member_profiles tmp
      where tmp.user_id=access_row.user_id and tmp.status in ('active','training')
      on conflict (location_id,team_member_id,assignment_type) where status='active'
      do update set updated_at=excluded.updated_at;
    end loop;
  end loop;

  update public.team_location_assignments tla
  set status='inactive',updated_at=now(),notes=coalesce(tla.notes,'') || case when coalesce(tla.notes,'')='' then '' else E'\n' end || 'Removed automatically because territory no longer matches.'
  where tla.location_id=p_location_id
    and tla.assignment_type='territory_auto'
    and tla.status='active'
    and (root_member is null or tla.team_member_id<>root_member)
    and not exists (
      select 1
      from public.crm_territories t
      join public.crm_territory_access a on a.territory_id=t.id and a.status='active'
      join public.team_member_profiles tmp on tmp.user_id=a.user_id and tmp.id=tla.team_member_id
      where t.status='active' and public.crm_location_matches_territory(p_location_id,t.id)
      union all
      select 1
      from public.crm_territories t
      join public.team_member_profiles tmp on tmp.user_id=t.owner_user_id and tmp.id=tla.team_member_id
      where t.status='active' and public.crm_location_matches_territory(p_location_id,t.id)
    );
end;
$$;

create or replace function public.trg_locations_sync_territory_assignments()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.crm_sync_location_territory_assignments(new.id);
  return new;
end;
$$;

drop trigger if exists trg_locations_sync_territory_assignments on public.locations;
create trigger trg_locations_sync_territory_assignments
after insert or update of market,state,city,zip_code,postal_code,borough,neighborhood,latitude,longitude
on public.locations
for each row execute function public.trg_locations_sync_territory_assignments();

create or replace function public.trg_territory_scope_resync()
returns trigger
language plpgsql
set search_path = public
as $$
declare r record;
begin
  for r in select id from public.locations loop
    perform public.crm_sync_location_territory_assignments(r.id);
  end loop;
  return coalesce(new,old);
end;
$$;

drop trigger if exists trg_crm_territory_scopes_resync on public.crm_territory_scopes;
create trigger trg_crm_territory_scopes_resync
after insert or update or delete on public.crm_territory_scopes
for each row execute function public.trg_territory_scope_resync();

drop trigger if exists trg_crm_territory_access_resync on public.crm_territory_access;
create trigger trg_crm_territory_access_resync
after insert or update or delete on public.crm_territory_access
for each row execute function public.trg_territory_scope_resync();

alter table public.crm_territory_settings enable row level security;
alter table public.crm_territory_access enable row level security;
alter table public.crm_territory_scopes enable row level security;

revoke all on public.crm_territory_settings from anon,authenticated;
revoke all on public.crm_territory_access from anon,authenticated;
revoke all on public.crm_territory_scopes from anon,authenticated;
revoke execute on function public.crm_sync_location_territory_assignments(uuid) from public,anon,authenticated;
