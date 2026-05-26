create table if not exists public.seo_audit_runs (
  id uuid primary key default gen_random_uuid(), run_type text not null default 'audit', status text not null default 'completed', score integer null,
  pages_scanned integer not null default 0, issues_found integer not null default 0, critical_count integer not null default 0, warning_count integer not null default 0, improvement_count integer not null default 0, passed_count integer not null default 0,
  started_at timestamptz not null default now(), completed_at timestamptz null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create table if not exists public.seo_audit_issues (
  id uuid primary key default gen_random_uuid(), run_id uuid references public.seo_audit_runs(id) on delete cascade, severity text not null, title text not null, description text null,
  affected_area text null, affected_route text null, affected_file text null, current_value text null, recommended_fix text null, fix_url text null, status text not null default 'open', metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.feature_flags (
  id uuid primary key default gen_random_uuid(), key text not null unique, name text not null, description text null, category text null, enabled boolean not null default false, environment text not null default 'production', rollout_percentage integer not null default 100, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.feature_flag_audit_logs (
  id uuid primary key default gen_random_uuid(), flag_id uuid references public.feature_flags(id) on delete cascade, flag_key text null, action text not null, previous_value jsonb null, new_value jsonb null, changed_by uuid null, created_at timestamptz not null default now());
create table if not exists public.admin_system_logs (
  id uuid primary key default gen_random_uuid(), category text not null, level text not null default 'info', message text not null, source text null, actor_id uuid null, actor_email text null, entity_type text null, entity_id uuid null, request_id text null, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
create index if not exists seo_runs_created_status_idx on public.seo_audit_runs (created_at desc, status);
create index if not exists seo_issue_run_severity_status_idx on public.seo_audit_issues (run_id, severity, status);
create index if not exists feature_flags_key_enabled_cat_env_idx on public.feature_flags (key, enabled, category, environment);
create index if not exists admin_system_logs_category_level_created_idx on public.admin_system_logs (category, level, created_at desc);
create index if not exists admin_system_logs_entity_idx on public.admin_system_logs (entity_type, entity_id);
