alter table public.consumer_profiles
  add column if not exists personalization_enabled boolean not null default true;

alter table public.consumer_profiles
  add column if not exists personalization_updated_at timestamptz;

comment on column public.consumer_profiles.personalization_enabled is
  'Whether prior TheOutHaven activity may be used to personalize search ranking for this consumer.';

comment on column public.consumer_profiles.personalization_updated_at is
  'When the consumer last changed their personalization preference.';
