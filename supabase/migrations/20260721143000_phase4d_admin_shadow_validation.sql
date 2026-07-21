alter table public.search_ranking_rollout_settings
  add column if not exists shadow_test_enabled boolean not null default false;

update public.search_ranking_rollout_settings
set shadow_test_enabled = false
where id = true;
