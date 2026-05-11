-- Add TheOutHaven score columns for location tables.
-- Run this in the Supabase SQL editor, or apply it with your migration runner.

alter table public.restaurants
  add column if not exists theouthaven_score numeric default 0;

alter table public.activities
  add column if not exists theouthaven_score numeric default 0;

-- Backfill a 0-100 score from existing ratings when the score is empty.
-- A 5-star rating becomes 100, 4.5 becomes 90, etc.
update public.restaurants
set theouthaven_score = least(100, greatest(0, round(coalesce(rating, 0)::numeric * 20)))
where theouthaven_score is null or theouthaven_score = 0;

update public.activities
set theouthaven_score = least(100, greatest(0, round(coalesce(rating, 0)::numeric * 20)))
where theouthaven_score is null or theouthaven_score = 0;

alter table public.restaurants
  alter column theouthaven_score set not null;

alter table public.activities
  alter column theouthaven_score set not null;

comment on column public.restaurants.theouthaven_score is
  '0-100 TheOutHaven ranking/display score for restaurants.';

comment on column public.activities.theouthaven_score is
  '0-100 TheOutHaven ranking/display score for activities.';

create index if not exists restaurants_theouthaven_score_idx
  on public.restaurants (theouthaven_score desc);

create index if not exists activities_theouthaven_score_idx
  on public.activities (theouthaven_score desc);
