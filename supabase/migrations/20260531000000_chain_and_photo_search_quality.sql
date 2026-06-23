alter table if exists public.locations
  add column if not exists brand_type text default 'independent',
  add column if not exists chain_brand text,
  add column if not exists curation_tier text default 'standard',
  add column if not exists date_score numeric default 50,
  add column if not exists search_boost numeric default 0,
  add column if not exists is_chain boolean default false,
  add column if not exists has_photos boolean default false,
  add column if not exists photo_status text default 'missing_photo';

alter table if exists public.location_import_staging
  add column if not exists brand_type text default 'independent',
  add column if not exists chain_brand text,
  add column if not exists curation_tier text default 'standard',
  add column if not exists date_score numeric default 50,
  add column if not exists search_boost numeric default 0,
  add column if not exists is_chain boolean default false,
  add column if not exists has_photos boolean default false,
  add column if not exists photo_status text default 'missing_photo';

do $$
begin
  alter table if exists public.locations
    drop constraint if exists locations_photo_status_check;
  alter table if exists public.locations
    add constraint locations_photo_status_check check (photo_status in ('has_photo','missing_photo','needs_enrichment','owner_photo','admin_photo','google_photo','imported_photo'));
exception when others then
  raise notice 'Could not add locations photo_status check: %', sqlerrm;
end $$;

do $$
begin
  alter table if exists public.location_import_staging
    drop constraint if exists location_import_staging_photo_status_check;
  alter table if exists public.location_import_staging
    add constraint location_import_staging_photo_status_check check (photo_status in ('has_photo','missing_photo','needs_enrichment','owner_photo','admin_photo','google_photo','imported_photo'));
exception when others then
  raise notice 'Could not add staging photo_status check: %', sqlerrm;
end $$;

create or replace function public.oh_table_has_column(p_table text, p_column text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = p_table
      and column_name = p_column
  );
$$;

create or replace function public.oh_sql_photo_presence_expr(p_alias text, p_table text)
returns text
language plpgsql
stable
as $$
declare
  exprs text[] := array[]::text[];
begin
  if public.oh_table_has_column(p_table, 'main_image') then
    exprs := exprs || format('nullif(trim(%I.main_image), '''') is not null', p_alias);
  end if;
  if public.oh_table_has_column(p_table, 'image_url') then
    exprs := exprs || format('nullif(trim(%I.image_url), '''') is not null', p_alias);
  end if;
  if public.oh_table_has_column(p_table, 'photo_url') then
    exprs := exprs || format('nullif(trim(%I.photo_url), '''') is not null', p_alias);
  end if;
  if public.oh_table_has_column(p_table, 'photos') then
    exprs := exprs || format('coalesce(array_length(%I.photos, 1), 0) > 0', p_alias);
  end if;
  if public.oh_table_has_column(p_table, 'images') then
    exprs := exprs || format('coalesce(array_length(%I.images, 1), 0) > 0', p_alias);
  end if;
  if public.oh_table_has_column(p_table, 'gallery_images') then
    exprs := exprs || format('coalesce(array_length(%I.gallery_images, 1), 0) > 0', p_alias);
  end if;
  if public.oh_table_has_column(p_table, 'gallery_image_urls') then
    exprs := exprs || format('coalesce(array_length(%I.gallery_image_urls, 1), 0) > 0', p_alias);
  end if;
  if public.oh_table_has_column(p_table, 'photo_urls') then
    exprs := exprs || format('coalesce(array_length(%I.photo_urls, 1), 0) > 0', p_alias);
  end if;

  if array_length(exprs, 1) is null then
    return 'false';
  end if;
  return array_to_string(exprs, ' or ');
end;
$$;

do $$
declare
  photo_expr text;
begin
  if to_regclass('public.locations') is not null then
    photo_expr := public.oh_sql_photo_presence_expr('l', 'locations');
    execute format(
      'update public.locations l set has_photos = (%1$s), photo_status = case when (%1$s) then case when coalesce(photo_status, '''') in (''owner_photo'',''admin_photo'',''google_photo'',''imported_photo'') then photo_status else ''has_photo'' end else ''missing_photo'' end',
      photo_expr
    );

    update public.locations
    set quality_status = 'needs_photo', is_searchable = false, data_status = case when data_status = 'clean' then 'needs_review' else data_status end
    where coalesce(has_photos, false) = false
      and quality_status = 'publish_ready';
  end if;

  if to_regclass('public.location_import_staging') is not null then
    photo_expr := public.oh_sql_photo_presence_expr('s', 'location_import_staging');
    execute format(
      'update public.location_import_staging s set has_photos = (%1$s), photo_status = case when (%1$s) then case when coalesce(photo_status, '''') in (''owner_photo'',''admin_photo'',''google_photo'',''imported_photo'') then photo_status else ''has_photo'' end else ''missing_photo'' end',
      photo_expr
    );

    update public.location_import_staging
    set quality_status = 'needs_photo', updated_at = now()
    where coalesce(has_photos, false) = false
      and quality_status = 'publish_ready';
  end if;
end $$;

create index if not exists locations_chain_search_quality_idx on public.locations (is_chain, curation_tier, brand_type);
create index if not exists locations_photo_public_search_idx on public.locations (has_photos, photo_status, quality_status, is_searchable);
create index if not exists location_import_staging_photo_quality_idx on public.location_import_staging (has_photos, photo_status, quality_status, import_status);

create or replace function public.oh_publish_import_batch(p_batch_id uuid, p_limit integer default 250)
returns jsonb language plpgsql security definer as $$
declare inserted_count integer := 0; skipped_count integer := 0; begin
  insert into public.locations(location_type,name,restaurant_name,activity_name,address,city,state,zip_code,phone,website,latitude,longitude,primary_category,cuisine,cuisine_type,activity_type,primary_tag,tags,vibe_tags,best_for_tags,search_keywords,google_types,rating,review_count,main_image,images,description,import_source,import_source_id,normalized_name,normalized_address,normalized_phone,location_key,quality_score,quality_status,duplicate_status,data_status,is_searchable,enrichment_status,enrichment_priority,last_cleaned_at,last_deduped_at,brand_type,chain_brand,curation_tier,date_score,search_boost,is_chain,has_photos,photo_status,is_featured)
  select s.location_type, coalesce(s.name, s.restaurant_name, s.activity_name), s.restaurant_name, s.activity_name, s.address, s.city, s.state, s.zip_code, s.phone, s.website, s.latitude, s.longitude, s.primary_category, s.cuisine, s.cuisine_type, s.activity_type, s.primary_tag, s.tags, s.vibe_tags, s.best_for_tags, s.search_keywords, s.google_types, s.rating, s.review_count, s.main_image, s.images, s.description, s.source, s.source_id, s.normalized_name, s.normalized_address, s.normalized_phone, s.location_key, s.quality_score, case when coalesce(s.has_photos, false) then 'publish_ready' else 'needs_photo' end, 'unique', case when coalesce(s.has_photos, false) then 'clean' else 'needs_review' end, coalesce(s.has_photos, false), case when s.quality_score >= 85 then 'queued' else 'not_started' end, case when coalesce(s.has_photos, false) = false and s.quality_score >= 75 then 70 when coalesce(s.review_count, 0) >= 100 then 100 when coalesce(s.rating, 0) >= 4.5 then 90 when s.quality_score >= 85 then 80 else 50 end, now(), now(), coalesce(s.brand_type, 'independent'), s.chain_brand, coalesce(s.curation_tier, 'standard'), coalesce(s.date_score, 50), coalesce(s.search_boost, 0), coalesce(s.is_chain, false), coalesce(s.has_photos, false), case when coalesce(s.has_photos, false) then coalesce(nullif(s.photo_status, 'missing_photo'), 'has_photo') else 'missing_photo' end, case when coalesce(s.is_chain, false) then false else null end
  from public.location_import_staging s where s.batch_id = p_batch_id and s.import_status = 'staged' and s.quality_status = 'publish_ready' and coalesce(s.has_photos, false) = true and s.duplicate_status = 'unique' and coalesce(trim(s.address), '') <> '' and s.latitude is not null and s.longitude is not null and coalesce(trim(s.primary_category), '') <> '' and not exists (select 1 from public.locations l where l.import_source = s.source and l.import_source_id = s.source_id)
  order by s.quality_score desc, s.review_count desc nulls last limit p_limit;
  get diagnostics inserted_count = row_count;
  update public.location_import_staging s set import_status = 'published', updated_at = now() where s.batch_id = p_batch_id and s.import_status = 'staged' and s.quality_status = 'publish_ready' and coalesce(s.has_photos, false) = true and s.duplicate_status = 'unique' and exists (select 1 from public.locations l where l.import_source = s.source and l.import_source_id = s.source_id);
  update public.location_import_batches b set total_published = coalesce(total_published, 0) + inserted_count, status = 'published', completed_at = now() where b.id = p_batch_id;
  select count(*) into skipped_count from public.location_import_staging where batch_id = p_batch_id and import_status in ('duplicate', 'rejected') or (batch_id = p_batch_id and quality_status = 'needs_photo');
  return jsonb_build_object('success', true, 'batch_id', p_batch_id, 'inserted', inserted_count, 'skipped', skipped_count);
end; $$;

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
      and coalesce(s.has_photos, false) = true
      and s.photo_status is distinct from 'missing_photo'
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
      location_type, name, restaurant_name, activity_name, address, city, state, zip_code, phone, website,
      latitude, longitude, primary_category, cuisine, cuisine_type, activity_type, primary_tag,
      tags, vibe_tags, best_for_tags, search_keywords, google_types, rating, review_count, main_image, images,
      description, import_source, import_source_id, normalized_name, normalized_address, normalized_phone,
      location_key, quality_score, quality_status, duplicate_status, data_status, is_searchable,
      enrichment_status, enrichment_priority, last_cleaned_at, last_deduped_at,
      brand_type, chain_brand, curation_tier, date_score, search_boost, is_chain, has_photos, photo_status, is_featured
    )
    select
      r.location_type, coalesce(r.name, r.restaurant_name, r.activity_name), r.restaurant_name, r.activity_name, r.address, r.city, r.state, r.zip_code, r.phone, r.website,
      r.latitude, r.longitude, r.primary_category, r.cuisine, r.cuisine_type, r.activity_type, r.primary_tag,
      r.tags, r.vibe_tags, r.best_for_tags, r.search_keywords, r.google_types, r.rating, r.review_count, r.main_image, r.images,
      r.description, r.source, r.source_id, r.normalized_name, r.normalized_address, r.normalized_phone,
      r.location_key, r.quality_score, 'publish_ready', 'unique', 'clean', true,
      case when r.quality_score >= 85 then 'queued' else 'not_started' end,
      case when coalesce(r.review_count, 0) >= 100 then 100 when coalesce(r.rating, 0) >= 4.5 then 90 when r.quality_score >= 85 then 80 else 50 end,
      now(), now(), coalesce(r.brand_type, 'independent'), r.chain_brand, coalesce(r.curation_tier, 'standard'), coalesce(r.date_score, 50), coalesce(r.search_boost, 0), coalesce(r.is_chain, false), true,
      coalesce(nullif(r.photo_status, 'missing_photo'), 'has_photo'), case when coalesce(r.is_chain, false) then false else null end
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

create or replace function public.oh_public_search_quality_predicate(
  p_is_searchable boolean,
  p_quality_status text,
  p_duplicate_status text,
  p_has_photos boolean,
  p_photo_status text,
  p_address text,
  p_latitude numeric,
  p_longitude numeric
)
returns boolean
language sql
immutable
as $$
  select p_is_searchable is true
    and p_quality_status = 'publish_ready'
    and p_duplicate_status is distinct from 'duplicate'
    and p_has_photos is true
    and p_photo_status is distinct from 'missing_photo'
    and nullif(trim(p_address), '') is not null
    and p_latitude is not null
    and p_longitude is not null;
$$;
