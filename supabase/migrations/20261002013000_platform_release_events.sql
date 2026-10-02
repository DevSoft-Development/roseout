create table if not exists public.platform_release_events (
  event_id bigint generated always as identity primary key,
  release_id text not null
    references public.platform_releases(release_id),
  event_type text not null,
  prior_state text
    check (prior_state is null or prior_state in (
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
  new_state text
    check (new_state is null or new_state in (
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
  source text not null,
  provider text,
  actor text not null
    check (actor in ('github', 'azure', 'aws', 'supabase', 'mobile', 'admin', 'automation')),
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint platform_release_events_type_nonempty
    check (length(btrim(event_type)) > 0),
  constraint platform_release_events_source_nonempty
    check (length(btrim(source)) > 0),
  constraint platform_release_events_evidence_object
    check (jsonb_typeof(evidence) = 'object')
);

comment on table public.platform_release_events is
  'Append-only server-managed audit history for release lifecycle transitions, deployment evidence, and rollback actions.';

alter table public.platform_release_events enable row level security;

revoke all privileges on table public.platform_release_events
  from public, anon, authenticated, service_role;

grant select, insert
  on table public.platform_release_events
  to service_role;

grant usage, select
  on sequence public.platform_release_events_event_id_seq
  to service_role;

create index if not exists platform_release_events_release_created_idx
  on public.platform_release_events (release_id, created_at desc);

create index if not exists platform_release_events_type_created_idx
  on public.platform_release_events (event_type, created_at desc);

create index if not exists platform_release_events_state_created_idx
  on public.platform_release_events (new_state, created_at desc)
  where new_state is not null;
