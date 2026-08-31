alter table public.search_ranking_rollout_settings
  add column if not exists shadow_enabled boolean not null default false,
  add column if not exists kill_switch boolean not null default false;

comment on column public.search_ranking_rollout_settings.shadow_enabled is
  'Compute and log hybrid ordering while continuing to serve control ordering.';
comment on column public.search_ranking_rollout_settings.kill_switch is
  'Emergency override that forces control ranking without deleting rollout configuration.';
