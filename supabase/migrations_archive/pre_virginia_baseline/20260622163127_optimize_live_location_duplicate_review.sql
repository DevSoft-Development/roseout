create extension if not exists pg_trgm;

create index if not exists locations_normalized_name_idx on public.locations(normalized_name);
create index if not exists locations_normalized_address_idx on public.locations(normalized_address);
create index if not exists locations_city_state_idx on public.locations(city, state);
create index if not exists locations_location_key_idx on public.locations(location_key);
create index if not exists locations_google_place_id_not_null_idx on public.locations(google_place_id) where google_place_id is not null;
create index if not exists locations_normalized_phone_not_null_idx on public.locations(normalized_phone) where normalized_phone is not null;
create index if not exists locations_duplicate_status_idx on public.locations(duplicate_status);
create index if not exists locations_is_searchable_idx on public.locations(is_searchable);
create index if not exists location_duplicate_review_status_score_created_idx on public.location_duplicate_review(status, duplicate_score desc, created_at desc);
create index if not exists location_duplicate_review_location_a_idx on public.location_duplicate_review(location_a_id);
create index if not exists location_duplicate_review_location_b_idx on public.location_duplicate_review(location_b_id);
create index if not exists location_duplicate_review_suggested_master_idx on public.location_duplicate_review(suggested_master_id);

create or replace function public.oh_find_live_location_duplicates(p_limit integer default 500)
returns jsonb language plpgsql security definer as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 500), 2000));
  v_changed integer := 0;
  v_pending integer := 0;
begin
  with base as materialized (
    select *
    from public.locations l
    where coalesce(l.duplicate_status, '') <> 'duplicate'
      and coalesce((to_jsonb(l)->>'is_hidden')::boolean, false) = false
      and (to_jsonb(l)->>'deleted_at') is null
  ),
  same_location_key as (
    select least(a.id,b.id) location_a_id, greatest(a.id,b.id) location_b_id, 100::numeric duplicate_score, array['same_location_key']::text[] reasons
    from base a join base b on a.id < b.id and nullif(a.location_key,'') is not null and a.location_key = b.location_key
    limit v_limit
  ),
  same_google_place_id as (
    select least(a.id,b.id), greatest(a.id,b.id), 100::numeric, array['same_google_place_id']::text[]
    from base a join base b on a.id < b.id and nullif(a.google_place_id,'') is not null and a.google_place_id = b.google_place_id
    limit v_limit
  ),
  same_normalized_name_address as (
    select least(a.id,b.id), greatest(a.id,b.id), 100::numeric, array['same_normalized_name_address']::text[]
    from base a join base b on a.id < b.id
      and nullif(a.normalized_name,'') is not null and a.normalized_name = b.normalized_name
      and nullif(a.normalized_address,'') is not null and a.normalized_address = b.normalized_address
      and coalesce(public.oh_normalize_text(a.city),'') = coalesce(public.oh_normalize_text(b.city),'')
      and coalesce(upper(a.state),'') = coalesce(upper(b.state),'')
    limit v_limit
  ),
  same_phone_similar_name as (
    select least(a.id,b.id), greatest(a.id,b.id), 95::numeric, array['same_phone']::text[]
    from base a join base b on a.id < b.id
      and nullif(a.normalized_phone,'') is not null and a.normalized_phone = b.normalized_phone
      and similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) >= 0.72
    limit v_limit
  ),
  similar_name_same_address as (
    select least(a.id,b.id), greatest(a.id,b.id), round(similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) * 100)::numeric, array['similar_name_same_address']::text[]
    from base a join base b on a.id < b.id
      and nullif(a.normalized_address,'') is not null and a.normalized_address = b.normalized_address
      and coalesce(public.oh_normalize_text(a.city),'') = coalesce(public.oh_normalize_text(b.city),'')
      and coalesce(upper(a.state),'') = coalesce(upper(b.state),'')
      and similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) >= 0.72
    limit v_limit
  ),
  unioned as (
    select * from same_location_key
    union all select * from same_google_place_id
    union all select * from same_normalized_name_address
    union all select * from same_phone_similar_name
    union all select * from similar_name_same_address
  ),
  grouped as (
    select location_a_id, location_b_id, max(duplicate_score) duplicate_score, array_agg(distinct reason) match_reasons
    from unioned u cross join lateral unnest(u.reasons) reason
    group by location_a_id, location_b_id
    order by max(duplicate_score) desc
    limit v_limit
  ),
  enriched as (
    select g.location_a_id, g.location_b_id, g.duplicate_score,
      (g.match_reasons
        || case when coalesce(a.is_searchable,false) and coalesce(b.is_searchable,false) then array['both_searchable']::text[] else '{}'::text[] end
        || case when coalesce(a.location_type,'') <> coalesce(b.location_type,'') and (coalesce(a.location_type,'') in ('restaurant','activity','nightlife') or coalesce(b.location_type,'') in ('restaurant','activity','nightlife')) then array['cross_type_restaurant_activity']::text[] else '{}'::text[] end
      ) match_reasons,
      case when (case when nullif(a.google_place_id,'') is not null then 1 else 0 end, case when coalesce(cardinality(a.images),0) > 0 or nullif(coalesce(a.main_image,a.image_url),'') is not null then 1 else 0 end, coalesce(a.quality_score,0), coalesce(a.review_count,0), case when coalesce(a.is_searchable,false) then 1 else 0 end, -extract(epoch from coalesce(a.created_at, now()))) >=
                (case when nullif(b.google_place_id,'') is not null then 1 else 0 end, case when coalesce(cardinality(b.images),0) > 0 or nullif(coalesce(b.main_image,b.image_url),'') is not null then 1 else 0 end, coalesce(b.quality_score,0), coalesce(b.review_count,0), case when coalesce(b.is_searchable,false) then 1 else 0 end, -extract(epoch from coalesce(b.created_at, now()))) then a.id else b.id end suggested_master_id
    from grouped g join base a on a.id = g.location_a_id join base b on b.id = g.location_b_id
    where g.duplicate_score >= 70
  ),
  upserted as (
    insert into public.location_duplicate_review(location_a_id, location_b_id, suggested_master_id, duplicate_score, match_reasons, updated_at)
    select location_a_id, location_b_id, suggested_master_id, duplicate_score, match_reasons, now() from enriched
    on conflict (location_a_id, location_b_id) do update
      set suggested_master_id = excluded.suggested_master_id,
          duplicate_score = greatest(public.location_duplicate_review.duplicate_score, excluded.duplicate_score),
          match_reasons = (select array_agg(distinct r) from unnest(public.location_duplicate_review.match_reasons || excluded.match_reasons) r),
          updated_at = now()
      where public.location_duplicate_review.status = 'pending'
        and public.location_duplicate_review.duplicate_score <= excluded.duplicate_score
    returning 1
  )
  select count(*) into v_changed from upserted;

  select count(*) into v_pending from public.location_duplicate_review where status = 'pending';
  return jsonb_build_object('scanned', v_limit, 'inserted_or_updated', v_changed, 'pending_total', v_pending, 'limit_used', v_limit);
end; $$;

create or replace function public.oh_location_duplicate_review_summary()
returns jsonb language sql stable security definer as $$
  select jsonb_build_object(
    'pending', count(*) filter (where status = 'pending'),
    'highConfidencePending', count(*) filter (where status = 'pending' and duplicate_score >= 95),
    'bothSearchablePending', count(*) filter (where status = 'pending' and match_reasons @> array['both_searchable']::text[]),
    'merged', count(*) filter (where status = 'merged'),
    'ignored', count(*) filter (where status = 'ignored'),
    'notDuplicate', count(*) filter (where status = 'not_duplicate')
  )
  from public.location_duplicate_review;
$$;
