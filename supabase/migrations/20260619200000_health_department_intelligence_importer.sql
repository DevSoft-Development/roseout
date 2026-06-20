create table if not exists public.location_health_inspections (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade,
  source text not null default 'nyc_dohmh',
  source_record_id text,
  camis text,
  dba text,
  boro text,
  building text,
  street text,
  zipcode text,
  phone text,
  cuisine_description text,
  inspection_date date,
  action text,
  violation_code text,
  violation_description text,
  critical_flag text,
  score integer,
  grade text,
  grade_date date,
  record_date date,
  inspection_type text,
  match_confidence numeric,
  matched_by text,
  raw_payload jsonb,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

create unique index if not exists location_health_inspections_source_record_uidx
  on public.location_health_inspections(source, source_record_id)
  where source_record_id is not null;

create index if not exists location_health_inspections_location_id_idx
  on public.location_health_inspections(location_id);

create index if not exists location_health_inspections_camis_idx
  on public.location_health_inspections(camis);

create index if not exists location_health_inspections_grade_idx
  on public.location_health_inspections(grade);

create index if not exists location_health_inspections_inspection_date_idx
  on public.location_health_inspections(inspection_date desc);

create table if not exists public.health_intelligence_import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'nyc_dohmh',
  status text not null default 'running',
  started_at timestamp with time zone default now(),
  finished_at timestamp with time zone,
  requested_limit integer,
  fetched_count integer default 0,
  processed_count integer default 0,
  matched_count integer default 0,
  updated_location_count integer default 0,
  inserted_inspection_count integer default 0,
  skipped_count integer default 0,
  failed_count integer default 0,
  error text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamp with time zone default now()
);

comment on table public.location_health_inspections is 'Imported Health Department inspection records matched to canonical TheOutHaven locations.';
comment on table public.health_intelligence_import_runs is 'Nightly and manual Health Department Intelligence importer run history.';

notify pgrst, 'reload schema';
