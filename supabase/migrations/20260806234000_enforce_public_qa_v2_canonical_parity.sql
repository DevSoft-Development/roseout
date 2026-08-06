begin;

insert into public.app_settings (key, value, updated_at)
values
  (
    'search_core_v2_rollout',
    jsonb_build_object(
      'mode', 'v2',
      'enabled', true,
      'killSwitch', false,
      'internalOnly', false,
      'shadowEnabled', false,
      'rolloutPercentage', 100
    ),
    now()
  ),
  (
    'search_profile_rollout',
    jsonb_build_object(
      'mode', 'primary',
      'canaryPercent', 100,
      'killSwitch', false
    ),
    now()
  )
on conflict (key) do update
set value = excluded.value,
    updated_at = excluded.updated_at;

commit;
