begin;

update public.app_settings
set value = jsonb_build_object(
      'mode', 'primary',
      'canaryPercent', 100,
      'killSwitch', false
    ),
    updated_at = now()
where key = 'search_profile_rollout';

insert into public.app_settings (key, value, updated_at)
select
  'search_profile_rollout',
  jsonb_build_object(
    'mode', 'primary',
    'canaryPercent', 100,
    'killSwitch', false
  ),
  now()
where not exists (
  select 1
  from public.app_settings
  where key = 'search_profile_rollout'
);

commit;
