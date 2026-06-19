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

alter table if exists public.locations
  add column if not exists health_department_grade text,
  add column if not exists health_department_score integer,
  add column if not exists health_department_last_inspection_date date,
  add column if not exists health_department_source text,
  add column if not exists health_department_source_url text,
  add column if not exists health_department_notes text,
  add column if not exists health_department_updated_at timestamp with time zone,
  add column if not exists health_department_camis text,
  add column if not exists health_department_match_confidence numeric,
  add column if not exists health_department_matched_by text;

create index if not exists locations_health_department_grade_idx on public.locations(health_department_grade);
create index if not exists locations_health_department_score_idx on public.locations(health_department_score);
create index if not exists locations_health_department_camis_idx on public.locations(health_department_camis);

comment on table public.location_health_inspections is 'Imported Health Department inspection records matched to canonical TheOutHaven locations.';
comment on table public.health_intelligence_import_runs is 'Nightly and manual Health Department Intelligence importer run history.';
comment on column public.locations.health_department_grade is 'Small public health department grade display, such as A, B, C, Grade Pending, or Not Yet Graded.';
comment on column public.locations.health_department_score is 'Health department inspection score. Lower is usually better when provided by the source.';
comment on column public.locations.health_department_last_inspection_date is 'Most recent known health department inspection date.';
comment on column public.locations.health_department_source is 'Health department source label, such as NYC DOHMH.';
comment on column public.locations.health_department_source_url is 'Optional public source URL for health department inspection data.';
comment on column public.locations.health_department_notes is 'Optional internal notes for health department intelligence.';
comment on column public.locations.health_department_updated_at is 'Timestamp when health department intelligence was last updated.';
comment on column public.locations.health_department_camis is 'NYC DOHMH CAMIS identifier when matched.';
comment on column public.locations.health_department_match_confidence is 'Confidence score for matching imported health data to canonical location.';
comment on column public.locations.health_department_matched_by is 'Matching strategy used for the current health intelligence match.';

notify pgrst, 'reload schema';
