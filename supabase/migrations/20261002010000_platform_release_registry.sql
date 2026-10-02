create table if not exists public.platform_releases (
  release_id text primary key,
  git_sha text not null,
  surface text not null,
  provider text not null,
  artifact_digest text,
  artifact_ref text,
  environment text not null default 'production',
  state text not null
    check (state in (
      'BUILDING',
      'VALIDATING',
      'CANDIDATE',
      'CANARY',
      'PROMOTING',
      'STABLE',
      'DEGRADED',
      'ROLLING_BACK',
      'ROLLED_BACK',
      'FAILED'
    )),
  previous_good_release_id text
    references public.platform_releases(release_id)
    on delete set null,
  schema_version text,
  runtime_version text,
  azure_revision text,
  azure_primary_state text,
  azure_secondary_state text,
  aws_admin_image text,
  aws_business_image text,
  aws_reserve_image text,
  worker_release text,
  supabase_schema_version text,
  supabase_dr_state text,
  ios_build text,
  android_build text,
  ota_release text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  deployed_at timestamptz,
  promoted_at timestamptz,
  updated_at timestamptz not null default now(),
  rollback_reason text,
  constraint platform_releases_git_sha_format
    check (git_sha ~ '^[0-9a-f]{7,64}$'),
  constraint platform_releases_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

comment on table public.platform_releases is
  'Server-managed multi-cloud release registry for current, candidate, previous-good, rollback, DR, and mobile release state.';

alter table public.platform_releases enable row level security;

revoke all privileges on table public.platform_releases
  from public, anon, authenticated, service_role;

grant select, insert, update, delete
  on table public.platform_releases
  to service_role;

create index if not exists platform_releases_surface_state_idx
  on public.platform_releases (environment, surface, state, created_at desc);

create index if not exists platform_releases_git_sha_idx
  on public.platform_releases (git_sha, created_at desc);

create index if not exists platform_releases_previous_good_idx
  on public.platform_releases (previous_good_release_id)
  where previous_good_release_id is not null;
