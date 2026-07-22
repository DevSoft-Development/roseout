-- Prevent trusted park records from being classified as specific indoor activities.
--
-- Production evidence showed Bowling Green (NYC Parks) carrying generated
-- `games` / `bowling` taxonomy. Those derived fields caused the explicit
-- bowling qualifier to accept the park and pair it with a steakhouse.

create or replace function public.normalize_trusted_park_activity_taxonomy()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  trusted_park boolean;
begin
  trusted_park :=
    lower(coalesce(new.website, '')) like '%nycgovparks.org%'
    or lower(coalesce(new.primary_category, '')) in (
      'park', 'public park', 'green space', 'garden', 'plaza', 'playground'
    )
    or lower(coalesce(new.activity_type, '')) in (
      'park', 'public park', 'green space', 'garden', 'plaza', 'playground'
    )
    or exists (
      select 1
      from unnest(coalesce(new.google_types, array[]::text[])) as value
      where lower(replace(value, '_', ' ')) in (
        'park', 'public park', 'garden', 'plaza', 'playground',
        'tourist attraction', 'point of interest'
      )
    );

  -- A provider's explicit bowling-alley type is stronger than a broad park
  -- signal (for example, a bowling venue inside a recreation complex).
  if trusted_park and not exists (
    select 1
    from unnest(coalesce(new.google_types, array[]::text[])) as value
    where lower(value) = 'bowling_alley'
  ) then
    new.activity_type := 'park';
    new.primary_category := 'park';

    new.tags := coalesce((
      select array_agg(value order by ord)
      from unnest(coalesce(new.tags, array[]::text[])) with ordinality as item(value, ord)
      where lower(value) not in (
        'bowling', 'bowling alley', 'bowling lanes', 'games', 'entertainment',
        'alley', 'lanes'
      )
    ), array[]::text[]);

    new.search_keywords := coalesce((
      select array_agg(value order by ord)
      from unnest(coalesce(new.search_keywords, array[]::text[])) with ordinality as item(value, ord)
      where lower(value) not in (
        'bowling', 'bowling alley', 'bowling lanes', 'games', 'entertainment',
        'alley', 'lanes'
      )
      and lower(value) not like '%bowling alley%'
    ), array[]::text[]);

    new.semantic_tags := coalesce((
      select array_agg(value order by ord)
      from unnest(coalesce(new.semantic_tags, array[]::text[])) with ordinality as item(value, ord)
      where lower(value) not in (
        'bowling', 'bowling alley', 'bowling lanes', 'games', 'entertainment',
        'alley', 'lanes'
      )
    ), array[]::text[]);

    new.intent_tags := coalesce((
      select array_agg(value order by ord)
      from unnest(coalesce(new.intent_tags, array[]::text[])) with ordinality as item(value, ord)
      where lower(value) not in ('bowling', 'games', 'entertainment')
    ), array[]::text[]);

    new.date_style_tags := coalesce((
      select array_agg(value order by ord)
      from unnest(coalesce(new.date_style_tags, array[]::text[])) with ordinality as item(value, ord)
      where lower(value) not in ('bowling', 'interactive')
    ), array[]::text[]);

    new.search_document := nullif(trim(regexp_replace(
      coalesce(new.search_document, ''),
      '\m(bowling alley|bowling lanes|bowling|games|entertainment|alley|lanes)\M',
      ' ',
      'gi'
    )), '');

    new.semantic_search_text := nullif(trim(regexp_replace(
      coalesce(new.semantic_search_text, ''),
      '\m(bowling alley|bowling lanes|bowling|games|entertainment|alley|lanes)\M',
      ' ',
      'gi'
    )), '');
  end if;

  return new;
end;
$$;

drop trigger if exists normalize_trusted_park_activity_taxonomy_trigger
  on public.locations;

create trigger normalize_trusted_park_activity_taxonomy_trigger
before insert or update of
  website,
  primary_category,
  activity_type,
  google_types,
  tags,
  search_keywords,
  semantic_tags,
  intent_tags,
  date_style_tags,
  search_document,
  semantic_search_text
on public.locations
for each row
execute function public.normalize_trusted_park_activity_taxonomy();

-- Repair existing polluted park records immediately. Assigning the columns to
-- themselves intentionally invokes the trigger and keeps the cleanup generic;
-- it does not blacklist one location ID.
update public.locations
set
  website = website,
  primary_category = primary_category,
  activity_type = activity_type,
  google_types = google_types,
  tags = tags,
  search_keywords = search_keywords,
  semantic_tags = semantic_tags,
  intent_tags = intent_tags,
  date_style_tags = date_style_tags,
  search_document = search_document,
  semantic_search_text = semantic_search_text
where
  lower(coalesce(website, '')) like '%nycgovparks.org%'
  or lower(coalesce(primary_category, '')) in (
    'park', 'public park', 'green space', 'garden', 'plaza', 'playground'
  )
  or lower(coalesce(activity_type, '')) in (
    'park', 'public park', 'green space', 'garden', 'plaza', 'playground'
  );

comment on function public.normalize_trusted_park_activity_taxonomy() is
  'Makes trusted park classification override polluted generated specific-activity terms, while preserving provider-confirmed bowling_alley venues.';
