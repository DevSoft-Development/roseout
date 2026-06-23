-- Emergency duplicate check before attempting a unique index:
-- select import_source, import_source_id, count(*)
-- from public.locations
-- where import_source is not null
--   and import_source_id is not null
-- group by import_source, import_source_id
-- having count(*) > 1;

-- Prefer a unique import-source key when existing data allows it. If duplicates
-- already exist, keep the migration moving with a non-unique lookup index so the
-- publish function can still avoid CRM/search/QR overwrites using NOT EXISTS.
do $$
begin
  begin
    create unique index if not exists locations_import_source_id_unique_idx
      on public.locations(import_source, import_source_id)
      where import_source is not null and import_source_id is not null;
  exception
    when unique_violation or duplicate_table or others then
      raise notice 'Skipping unique locations(import_source, import_source_id) index; existing duplicates may need cleanup first: %', sqlerrm;
      create index if not exists locations_import_source_id_lookup_idx
        on public.locations(import_source, import_source_id)
        where import_source is not null and import_source_id is not null;
  end;
end;
$$;

create or replace function public.oh_publish_ready_staged_locations(p_limit integer default 500)
returns jsonb
language plpgsql
security definer
as $$
declare
  inserted_count integer := 0;
  marked_count integer := 0;
begin
  with ready as (
    select s.*
    from public.location_import_staging s
    where s.import_status = 'staged'
      and s.quality_status = 'publish_ready'
      and s.duplicate_status = 'unique'
      and coalesce(trim(s.address), '') <> ''
      and s.latitude is not null
      and s.longitude is not null
      and coalesce(trim(s.primary_category), '') <> ''
      and not exists (
        select 1
        from public.locations l
        where l.import_source = s.source
          and l.import_source_id = s.source_id
      )
    order by s.quality_score desc, s.created_at asc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000)
  ),
  inserted as (
    insert into public.locations (
      location_type,
      name,
      restaurant_name,
      activity_name,
      address,
      city,
      state,
      zip_code,
      phone,
      website,
      latitude,
      longitude,
      primary_category,
      cuisine,
      cuisine_type,
      activity_type,
      primary_tag,
      tags,
      vibe_tags,
      best_for_tags,
      search_keywords,
      google_types,
      rating,
      review_count,
      main_image,
      images,
      description,
      import_source,
      import_source_id,
      normalized_name,
      normalized_address,
      normalized_phone,
      location_key,
      quality_score,
      quality_status,
      duplicate_status,
      data_status,
      is_searchable,
      enrichment_status,
      enrichment_priority,
      last_cleaned_at,
      last_deduped_at
    )
    select
      r.location_type,
      coalesce(r.name, r.restaurant_name, r.activity_name),
      r.restaurant_name,
      r.activity_name,
      r.address,
      r.city,
      r.state,
      r.zip_code,
      r.phone,
      r.website,
      r.latitude,
      r.longitude,
      r.primary_category,
      r.cuisine,
      r.cuisine_type,
      r.activity_type,
      r.primary_tag,
      r.tags,
      r.vibe_tags,
      r.best_for_tags,
      r.search_keywords,
      r.google_types,
      r.rating,
      r.review_count,
      r.main_image,
      r.images,
      r.description,
      r.source,
      r.source_id,
      r.normalized_name,
      r.normalized_address,
      r.normalized_phone,
      r.location_key,
      r.quality_score,
      r.quality_status,
      'unique',
      'clean',
      true,
      case
        when r.quality_score >= 85 then 'queued'
        else 'not_started'
      end,
      case
        when coalesce(r.review_count, 0) >= 100 then 100
        when coalesce(r.rating, 0) >= 4.5 then 90
        when r.quality_score >= 85 then 80
        else 50
      end,
      now(),
      now()
    from ready r
    on conflict do nothing
    returning import_source, import_source_id
  ),
  marked as (
    update public.location_import_staging s
    set import_status = 'published',
        updated_at = now()
    where exists (
      select 1
      from inserted i
      where i.import_source = s.source
        and i.import_source_id = s.source_id
    )
    returning s.id
  )
  select
    (select count(*) from inserted),
    (select count(*) from marked)
  into inserted_count, marked_count;

  return jsonb_build_object(
    'success', true,
    'inserted', inserted_count,
    'markedPublished', marked_count
  );
end;
$$;
