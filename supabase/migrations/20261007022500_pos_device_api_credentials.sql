-- Device-authenticated ThePOSHaven cashier API credentials.
-- Global control plane: credentials survive operational shard failover.
-- toh:replicated-dml-reviewed

create table if not exists public.pos_device_claim_codes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.pos_hardware_devices(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists pos_device_claim_codes_device_idx
  on public.pos_device_claim_codes(device_id,expires_at desc);

create table if not exists public.pos_device_api_credentials (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.pos_hardware_devices(id) on delete cascade,
  installation_id text not null,
  credential_hash text not null unique,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique(device_id,installation_id)
);

create index if not exists pos_device_api_credentials_active_idx
  on public.pos_device_api_credentials(device_id,revoked_at);

alter table public.pos_device_claim_codes enable row level security;
alter table public.pos_device_api_credentials enable row level security;
revoke all on table public.pos_device_claim_codes from public,anon,authenticated;
revoke all on table public.pos_device_api_credentials from public,anon,authenticated;
grant select,insert,update,delete on table public.pos_device_claim_codes to service_role;
grant select,insert,update,delete on table public.pos_device_api_credentials to service_role;


create or replace function public.pos_claim_device_api_credential(
  p_device_id uuid,
  p_code_hash text,
  p_installation_id text,
  p_credential_hash text
)
returns table(location_id uuid, role text, station_key text)
language plpgsql
security invoker
set search_path=public
as $$
declare
  v_code public.pos_device_claim_codes%rowtype;
  v_assignment public.pos_hardware_assignments%rowtype;
begin
  if coalesce(btrim(p_installation_id),'')='' or coalesce(btrim(p_credential_hash),'')='' then
    raise exception 'pos_device_claim_invalid';
  end if;

  select * into v_code
    from public.pos_device_claim_codes
   where device_id=p_device_id
     and code_hash=p_code_hash
   for update;
  if not found or v_code.used_at is not null or v_code.expires_at <= now() then
    raise exception 'pos_device_claim_code_invalid';
  end if;

  select * into v_assignment
    from public.pos_hardware_assignments
   where device_id=p_device_id
     and assignment_status='active'
   limit 1;
  if not found then raise exception 'pos_device_not_assigned'; end if;

  insert into public.pos_device_api_credentials(
    device_id,installation_id,credential_hash,last_used_at,revoked_at
  ) values (
    p_device_id,btrim(p_installation_id),p_credential_hash,now(),null
  )
  on conflict(device_id,installation_id) do update
     set credential_hash=excluded.credential_hash,
         last_used_at=excluded.last_used_at,
         revoked_at=null;

  update public.pos_device_claim_codes
     set used_at=now()
   where id=v_code.id;

  return query select v_assignment.location_id,v_assignment.role,v_assignment.station_key;
end;
$$;

revoke all on function public.pos_claim_device_api_credential(uuid,text,text,text)
  from public,anon,authenticated;
grant execute on function public.pos_claim_device_api_credential(uuid,text,text,text)
  to service_role;
