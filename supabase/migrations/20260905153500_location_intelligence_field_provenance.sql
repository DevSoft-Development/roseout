-- Canonical field-level authority/provenance for Location Intelligence.
-- Lower-authority providers cannot replace higher-authority evidence.

create table if not exists public.location_field_provenance (
  location_id uuid not null references public.locations(id) on delete cascade,
  field_name text not null,
  authority_source text not null check (authority_source in (
    'owner','trusted_internal','google','official_website','secondary_provider','ai_inference'
  )),
  source_ref text,
  confidence numeric(5,4),
  evidence jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (location_id, field_name)
);

create index if not exists location_field_provenance_source_idx
  on public.location_field_provenance(authority_source, updated_at desc);

alter table public.location_field_provenance enable row level security;
revoke all on table public.location_field_provenance from public, anon, authenticated;
grant select, insert, update, delete on table public.location_field_provenance to service_role;

create or replace function public.upsert_location_field_provenance(
  p_location_id uuid,
  p_field_name text,
  p_authority_source text,
  p_source_ref text default null,
  p_confidence numeric default null,
  p_evidence jsonb default '{}'::jsonb,
  p_observed_at timestamptz default now()
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_existing_source text;
  v_existing_rank integer;
  v_incoming_rank integer;
begin
  v_incoming_rank := case p_authority_source
    when 'owner' then 600
    when 'trusted_internal' then 500
    when 'google' then 400
    when 'official_website' then 300
    when 'secondary_provider' then 200
    when 'ai_inference' then 100
    else null
  end;

  if v_incoming_rank is null then
    raise exception 'Unsupported Location Intelligence authority source: %', p_authority_source;
  end if;

  select authority_source into v_existing_source
  from public.location_field_provenance
  where location_id = p_location_id and field_name = p_field_name
  for update;

  v_existing_rank := case v_existing_source
    when 'owner' then 600
    when 'trusted_internal' then 500
    when 'google' then 400
    when 'official_website' then 300
    when 'secondary_provider' then 200
    when 'ai_inference' then 100
    else 0
  end;

  if v_existing_rank > v_incoming_rank then
    return false;
  end if;

  insert into public.location_field_provenance(
    location_id,
    field_name,
    authority_source,
    source_ref,
    confidence,
    evidence,
    observed_at,
    updated_at
  ) values (
    p_location_id,
    p_field_name,
    p_authority_source,
    p_source_ref,
    p_confidence,
    coalesce(p_evidence, '{}'::jsonb),
    coalesce(p_observed_at, now()),
    now()
  )
  on conflict (location_id, field_name) do update
  set authority_source = excluded.authority_source,
      source_ref = excluded.source_ref,
      confidence = excluded.confidence,
      evidence = excluded.evidence,
      observed_at = excluded.observed_at,
      updated_at = now();

  return true;
end;
$$;

revoke all on function public.upsert_location_field_provenance(uuid,text,text,text,numeric,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.upsert_location_field_provenance(uuid,text,text,text,numeric,jsonb,timestamptz)
  to service_role;

comment on table public.location_field_provenance is
  'Field-level source authority for Location Intelligence. Precedence: owner > trusted internal > Google > official website > secondary provider > AI inference.';
