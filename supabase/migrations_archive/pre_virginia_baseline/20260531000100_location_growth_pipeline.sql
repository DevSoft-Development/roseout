create extension if not exists pg_trgm;
create extension if not exists unaccent;

create or replace function public.oh_normalize_text(value text)
returns text language sql immutable as $$
  select trim(lower(regexp_replace(regexp_replace(unaccent(coalesce(value, '')), '[^a-zA-Z0-9\s]', ' ', 'g'), '\s+', ' ', 'g')));
$$;

create or replace function public.oh_normalize_phone(value text)
returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(value, ''), '\D', '', 'g'), '');
$$;

create or replace function public.oh_location_key(p_name text, p_address text, p_city text, p_state text)
returns text language sql immutable as $$
  select md5(coalesce(public.oh_normalize_text(p_name), '') || '|' || coalesce(public.oh_normalize_text(p_address), '') || '|' || coalesce(public.oh_normalize_text(p_city), '') || '|' || coalesce(upper(trim(p_state)), ''));
$$;

alter table if exists public.locations
  add column if not exists normalized_name text,
  add column if not exists normalized_address text,
  add column if not exists normalized_phone text,
  add column if not exists location_key text,
  add column if not exists duplicate_status text default 'unknown',
  add column if not exists duplicate_of uuid,
  add column if not exists duplicate_score numeric default 0,
  add column if not exists import_source text,
  add column if not exists import_source_id text,
  add column if not exists quality_score numeric default 0,
  add column if not exists quality_status text default 'needs_review',
  add column if not exists enrichment_status text default 'not_started',
  add column if not exists enrichment_priority numeric default 0,
  add column if not exists last_cleaned_at timestamptz,
  add column if not exists last_deduped_at timestamptz,
  add column if not exists last_enriched_at timestamptz,
  add column if not exists public_location_url text,
  add column if not exists qr_code_url text,
  add column if not exists claim_qr_code_url text;

update public.locations
set normalized_name = public.oh_normalize_text(coalesce(name, restaurant_name, activity_name)),
    normalized_address = public.oh_normalize_text(address),
    normalized_phone = public.oh_normalize_phone(phone),
    location_key = public.oh_location_key(coalesce(name, restaurant_name, activity_name), address, city, state)
where normalized_name is null or normalized_address is null or normalized_phone is null or location_key is null;

create index if not exists locations_normalized_name_trgm_idx on public.locations using gin (normalized_name gin_trgm_ops);
create index if not exists locations_normalized_address_trgm_idx on public.locations using gin (normalized_address gin_trgm_ops);
create index if not exists locations_location_key_idx on public.locations (location_key);
create index if not exists locations_duplicate_status_idx on public.locations (duplicate_status);
create index if not exists locations_quality_status_idx on public.locations (quality_status);
create index if not exists locations_enrichment_status_idx on public.locations (enrichment_status);
create index if not exists locations_import_source_idx on public.locations (import_source, import_source_id) where import_source is not null and import_source_id is not null;

create table if not exists public.location_import_batches (
  id uuid primary key default gen_random_uuid(), source text not null, source_label text, status text not null default 'pending', requested_by uuid,
  total_seen integer default 0, total_staged integer default 0, total_duplicates integer default 0, total_possible_duplicates integer default 0,
  total_rejected integer default 0, total_publish_ready integer default 0, total_published integer default 0,
  started_at timestamptz default now(), completed_at timestamptz, error_message text, metadata jsonb default '{}'::jsonb
);

create table if not exists public.location_import_staging (
  id uuid primary key default gen_random_uuid(), batch_id uuid references public.location_import_batches(id) on delete cascade, source text not null, source_id text not null, source_url text,
  location_type text not null default 'restaurant', name text, restaurant_name text, activity_name text, address text, city text, state text, zip_code text, phone text, website text,
  latitude numeric, longitude numeric, primary_category text, cuisine text, cuisine_type text, activity_type text, primary_tag text,
  tags text[] default '{}', vibe_tags text[] default '{}', best_for_tags text[] default '{}', search_keywords text[] default '{}', google_types text[] default '{}',
  rating numeric, review_count integer, main_image text, images text[] default '{}', description text, raw_payload jsonb default '{}'::jsonb,
  normalized_name text, normalized_address text, normalized_phone text, location_key text,
  duplicate_status text default 'unchecked', duplicate_score numeric default 0, matched_location_id uuid,
  quality_score numeric default 0, quality_status text default 'needs_review', import_status text default 'staged', rejection_reason text,
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(source, source_id)
);

create index if not exists location_import_staging_batch_idx on public.location_import_staging(batch_id);
create index if not exists location_import_staging_source_idx on public.location_import_staging(source, source_id);
create index if not exists location_import_staging_status_idx on public.location_import_staging(import_status, quality_status, duplicate_status);
create index if not exists location_import_staging_location_key_idx on public.location_import_staging(location_key);
create index if not exists location_import_staging_name_trgm_idx on public.location_import_staging using gin (normalized_name gin_trgm_ops);
create index if not exists location_import_staging_address_trgm_idx on public.location_import_staging using gin (normalized_address gin_trgm_ops);

create table if not exists public.location_duplicate_matches (
  id uuid primary key default gen_random_uuid(), staging_id uuid references public.location_import_staging(id) on delete cascade,
  existing_location_id uuid references public.locations(id) on delete cascade, duplicate_score numeric not null default 0, match_reasons text[] default '{}', decision text default 'pending', created_at timestamptz default now(), unique(staging_id, existing_location_id)
);

create or replace function public.oh_calculate_location_quality(p_name text,p_address text,p_city text,p_state text,p_zip text,p_lat numeric,p_lng numeric,p_category text,p_phone text,p_website text,p_image text,p_rating numeric,p_review_count integer)
returns numeric language plpgsql immutable as $$
declare score numeric := 0; begin
  if coalesce(trim(p_name), '') <> '' then score := score + 15; end if; if coalesce(trim(p_address), '') <> '' then score := score + 15; end if;
  if coalesce(trim(p_city), '') <> '' then score := score + 8; end if; if coalesce(trim(p_state), '') <> '' then score := score + 6; end if; if coalesce(trim(p_zip), '') <> '' then score := score + 6; end if;
  if p_lat is not null and p_lng is not null then score := score + 15; end if; if coalesce(trim(p_category), '') <> '' then score := score + 15; end if;
  if coalesce(trim(p_phone), '') <> '' then score := score + 6; end if; if coalesce(trim(p_website), '') <> '' then score := score + 6; end if; if coalesce(trim(p_image), '') <> '' then score := score + 6; end if;
  if coalesce(p_rating, 0) >= 4 then score := score + 4; end if; if coalesce(p_review_count, 0) >= 25 then score := score + 4; end if; return least(100, score);
end; $$;

create or replace function public.oh_refresh_location_quality()
returns integer language plpgsql security definer as $$
declare updated_count integer; begin
  update public.locations l set normalized_name = public.oh_normalize_text(coalesce(l.name, l.restaurant_name, l.activity_name)), normalized_address = public.oh_normalize_text(l.address), normalized_phone = public.oh_normalize_phone(l.phone), location_key = public.oh_location_key(coalesce(l.name, l.restaurant_name, l.activity_name), l.address, l.city, l.state),
  quality_score = public.oh_calculate_location_quality(coalesce(l.name, l.restaurant_name, l.activity_name), l.address, l.city, l.state, l.zip_code, l.latitude, l.longitude, coalesce(l.primary_category, l.cuisine, l.cuisine_type, l.activity_type, l.primary_tag), l.phone, l.website, coalesce(l.main_image, l.images[1]), l.rating, l.review_count),
  quality_status = case when public.oh_calculate_location_quality(coalesce(l.name, l.restaurant_name, l.activity_name), l.address, l.city, l.state, l.zip_code, l.latitude, l.longitude, coalesce(l.primary_category, l.cuisine, l.cuisine_type, l.activity_type, l.primary_tag), l.phone, l.website, coalesce(l.main_image, l.images[1]), l.rating, l.review_count) >= 75 then 'publish_ready' when public.oh_calculate_location_quality(coalesce(l.name, l.restaurant_name, l.activity_name), l.address, l.city, l.state, l.zip_code, l.latitude, l.longitude, coalesce(l.primary_category, l.cuisine, l.cuisine_type, l.activity_type, l.primary_tag), l.phone, l.website, coalesce(l.main_image, l.images[1]), l.rating, l.review_count) >= 55 then 'review' else 'reject' end,
  is_searchable = public.oh_calculate_location_quality(coalesce(l.name, l.restaurant_name, l.activity_name), l.address, l.city, l.state, l.zip_code, l.latitude, l.longitude, coalesce(l.primary_category, l.cuisine, l.cuisine_type, l.activity_type, l.primary_tag), l.phone, l.website, coalesce(l.main_image, l.images[1]), l.rating, l.review_count) >= 75 and coalesce(trim(l.address), '') <> '' and l.latitude is not null and l.longitude is not null and coalesce(trim(coalesce(l.primary_category, l.cuisine, l.cuisine_type, l.activity_type, l.primary_tag)), '') <> '' and l.duplicate_status is distinct from 'duplicate',
  last_cleaned_at = now() where true; get diagnostics updated_count = row_count; return updated_count;
end; $$;

create or replace function public.oh_refresh_staging_quality(p_batch_id uuid default null)
returns integer language plpgsql security definer as $$
declare updated_count integer; begin
  update public.location_import_staging s set normalized_name = public.oh_normalize_text(coalesce(s.name, s.restaurant_name, s.activity_name)), normalized_address = public.oh_normalize_text(s.address), normalized_phone = public.oh_normalize_phone(s.phone), location_key = public.oh_location_key(coalesce(s.name, s.restaurant_name, s.activity_name), s.address, s.city, s.state),
  quality_score = public.oh_calculate_location_quality(coalesce(s.name, s.restaurant_name, s.activity_name), s.address, s.city, s.state, s.zip_code, s.latitude, s.longitude, coalesce(s.primary_category, s.cuisine, s.cuisine_type, s.activity_type, s.primary_tag), s.phone, s.website, coalesce(s.main_image, s.images[1]), s.rating, s.review_count),
  quality_status = case when public.oh_calculate_location_quality(coalesce(s.name, s.restaurant_name, s.activity_name), s.address, s.city, s.state, s.zip_code, s.latitude, s.longitude, coalesce(s.primary_category, s.cuisine, s.cuisine_type, s.activity_type, s.primary_tag), s.phone, s.website, coalesce(s.main_image, s.images[1]), s.rating, s.review_count) >= 75 then 'publish_ready' when public.oh_calculate_location_quality(coalesce(s.name, s.restaurant_name, s.activity_name), s.address, s.city, s.state, s.zip_code, s.latitude, s.longitude, coalesce(s.primary_category, s.cuisine, s.cuisine_type, s.activity_type, s.primary_tag), s.phone, s.website, coalesce(s.main_image, s.images[1]), s.rating, s.review_count) >= 55 then 'review' else 'reject' end,
  import_status = case when public.oh_calculate_location_quality(coalesce(s.name, s.restaurant_name, s.activity_name), s.address, s.city, s.state, s.zip_code, s.latitude, s.longitude, coalesce(s.primary_category, s.cuisine, s.cuisine_type, s.activity_type, s.primary_tag), s.phone, s.website, coalesce(s.main_image, s.images[1]), s.rating, s.review_count) < 55 then 'rejected' else s.import_status end,
  rejection_reason = case when public.oh_calculate_location_quality(coalesce(s.name, s.restaurant_name, s.activity_name), s.address, s.city, s.state, s.zip_code, s.latitude, s.longitude, coalesce(s.primary_category, s.cuisine, s.cuisine_type, s.activity_type, s.primary_tag), s.phone, s.website, coalesce(s.main_image, s.images[1]), s.rating, s.review_count) < 55 then 'low_quality' else s.rejection_reason end, updated_at = now()
  where p_batch_id is null or s.batch_id = p_batch_id; get diagnostics updated_count = row_count; return updated_count;
end; $$;

create or replace function public.oh_find_staging_duplicates(p_batch_id uuid default null)
returns integer language plpgsql security definer as $$
declare inserted_count integer; begin
  insert into public.location_duplicate_matches(staging_id, existing_location_id, duplicate_score, match_reasons)
  select s.id, l.id, greatest(case when s.location_key is not null and s.location_key = l.location_key then 100 else 0 end, case when s.normalized_phone is not null and l.normalized_phone is not null and s.normalized_phone = l.normalized_phone then 98 else 0 end, case when s.source = l.import_source and s.source_id = l.import_source_id then 100 else 0 end, case when s.source = 'google_places' and s.source_id = l.google_place_id then 100 else 0 end, (similarity(coalesce(s.normalized_name, ''), coalesce(l.normalized_name, '')) * 55 + similarity(coalesce(s.normalized_address, ''), coalesce(l.normalized_address, '')) * 45)),
  array_remove(array[case when s.location_key = l.location_key then 'same_location_key' end, case when s.normalized_phone is not null and l.normalized_phone is not null and s.normalized_phone = l.normalized_phone then 'same_phone' end, case when s.source = l.import_source and s.source_id = l.import_source_id then 'same_source_id' end, case when s.source = 'google_places' and s.source_id = l.google_place_id then 'same_google_place_id' end, case when similarity(coalesce(s.normalized_name, ''), coalesce(l.normalized_name, '')) >= 0.75 then 'similar_name' end, case when similarity(coalesce(s.normalized_address, ''), coalesce(l.normalized_address, '')) >= 0.75 then 'similar_address' end], null)
  from public.location_import_staging s join public.locations l on (s.location_key = l.location_key or (s.normalized_phone is not null and l.normalized_phone is not null and s.normalized_phone = l.normalized_phone) or (s.source = l.import_source and s.source_id = l.import_source_id) or (s.source = 'google_places' and s.source_id = l.google_place_id) or (similarity(coalesce(s.normalized_name, ''), coalesce(l.normalized_name, '')) >= 0.72 and similarity(coalesce(s.normalized_address, ''), coalesce(l.normalized_address, '')) >= 0.65))
  where p_batch_id is null or s.batch_id = p_batch_id on conflict (staging_id, existing_location_id) do update set duplicate_score = excluded.duplicate_score, match_reasons = excluded.match_reasons;
  get diagnostics inserted_count = row_count;
  update public.location_import_staging s set duplicate_status = case when d.duplicate_score >= 90 then 'duplicate' when d.duplicate_score >= 70 then 'possible_duplicate' else 'unique' end, duplicate_score = coalesce(d.duplicate_score, 0), matched_location_id = d.existing_location_id, import_status = case when d.duplicate_score >= 90 then 'duplicate' when s.quality_status = 'reject' then 'rejected' else s.import_status end, rejection_reason = case when d.duplicate_score >= 90 then 'duplicate_existing_location' when s.quality_status = 'reject' then 'low_quality' else s.rejection_reason end, updated_at = now() from (select distinct on (staging_id) staging_id, existing_location_id, duplicate_score from public.location_duplicate_matches order by staging_id, duplicate_score desc) d where s.id = d.staging_id and (p_batch_id is null or s.batch_id = p_batch_id);
  update public.location_import_staging s set duplicate_status = 'unique' where (p_batch_id is null or s.batch_id = p_batch_id) and duplicate_status = 'unchecked' and not exists (select 1 from public.location_duplicate_matches d where d.staging_id = s.id);
  update public.location_import_batches b set total_duplicates = x.duplicates, total_possible_duplicates = x.possible_duplicates, total_rejected = x.rejected, total_publish_ready = x.publish_ready from (select batch_id, count(*) filter (where duplicate_status = 'duplicate') as duplicates, count(*) filter (where duplicate_status = 'possible_duplicate') as possible_duplicates, count(*) filter (where import_status = 'rejected') as rejected, count(*) filter (where duplicate_status = 'unique' and quality_status = 'publish_ready' and import_status = 'staged') as publish_ready from public.location_import_staging where p_batch_id is null or batch_id = p_batch_id group by batch_id) x where b.id = x.batch_id;
  return inserted_count;
end; $$;

create or replace function public.oh_publish_import_batch(p_batch_id uuid, p_limit integer default 250)
returns jsonb language plpgsql security definer as $$
declare inserted_count integer := 0; skipped_count integer := 0; begin
  insert into public.locations(location_type,name,restaurant_name,activity_name,address,city,state,zip_code,phone,website,latitude,longitude,primary_category,cuisine,cuisine_type,activity_type,primary_tag,tags,vibe_tags,best_for_tags,search_keywords,google_types,rating,review_count,main_image,images,description,import_source,import_source_id,normalized_name,normalized_address,normalized_phone,location_key,quality_score,quality_status,duplicate_status,data_status,is_searchable,enrichment_status,enrichment_priority,last_cleaned_at,last_deduped_at)
  select s.location_type, coalesce(s.name, s.restaurant_name, s.activity_name), s.restaurant_name, s.activity_name, s.address, s.city, s.state, s.zip_code, s.phone, s.website, s.latitude, s.longitude, s.primary_category, s.cuisine, s.cuisine_type, s.activity_type, s.primary_tag, s.tags, s.vibe_tags, s.best_for_tags, s.search_keywords, s.google_types, s.rating, s.review_count, s.main_image, s.images, s.description, s.source, s.source_id, s.normalized_name, s.normalized_address, s.normalized_phone, s.location_key, s.quality_score, s.quality_status, 'unique', 'clean', true, case when s.quality_score >= 85 then 'queued' else 'not_started' end, case when coalesce(s.review_count, 0) >= 100 then 100 when coalesce(s.rating, 0) >= 4.5 then 90 when s.quality_score >= 85 then 80 else 50 end, now(), now()
  from public.location_import_staging s where s.batch_id = p_batch_id and s.import_status = 'staged' and s.quality_status = 'publish_ready' and s.duplicate_status = 'unique' and coalesce(trim(s.address), '') <> '' and s.latitude is not null and s.longitude is not null and coalesce(trim(s.primary_category), '') <> '' and not exists (select 1 from public.locations l where l.import_source = s.source and l.import_source_id = s.source_id)
  order by s.quality_score desc, s.review_count desc nulls last limit p_limit;
  get diagnostics inserted_count = row_count;
  update public.location_import_staging s set import_status = 'published', updated_at = now() where s.batch_id = p_batch_id and s.import_status = 'staged' and s.quality_status = 'publish_ready' and s.duplicate_status = 'unique' and exists (select 1 from public.locations l where l.import_source = s.source and l.import_source_id = s.source_id);
  update public.location_import_batches b set total_published = coalesce(total_published, 0) + inserted_count, status = 'published', completed_at = now() where b.id = p_batch_id;
  select count(*) into skipped_count from public.location_import_staging where batch_id = p_batch_id and import_status in ('duplicate', 'rejected');
  return jsonb_build_object('success', true, 'batch_id', p_batch_id, 'inserted', inserted_count, 'skipped', skipped_count);
end; $$;

alter table public.location_import_batches enable row level security;
alter table public.location_import_staging enable row level security;
alter table public.location_duplicate_matches enable row level security;

drop policy if exists "Admins can manage location import batches" on public.location_import_batches;
create policy "Admins can manage location import batches" on public.location_import_batches for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin')));
drop policy if exists "Admins can manage location import staging" on public.location_import_staging;
create policy "Admins can manage location import staging" on public.location_import_staging for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin')));
drop policy if exists "Admins can manage location duplicate matches" on public.location_duplicate_matches;
create policy "Admins can manage location duplicate matches" on public.location_duplicate_matches for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin'))) with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin')));
