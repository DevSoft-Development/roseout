create index if not exists locations_normalized_name_address_idx
  on public.locations(normalized_name, normalized_address, city, state)
  where normalized_name is not null and normalized_address is not null;

create or replace function public.oh_find_live_location_duplicates_fast(p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 100), 500));
  v_changed integer := 0;
  v_pending integer := 0;
begin
  with candidates as (
    select least(a.id, b.id) as location_a_id,
           greatest(a.id, b.id) as location_b_id,
           100::numeric as duplicate_score,
           array['same_location_key']::text[] as match_reasons
    from public.locations a
    join public.locations b
      on a.id < b.id
     and nullif(a.location_key, '') is not null
     and a.location_key = b.location_key
    where coalesce(a.duplicate_status, '') <> 'duplicate'
      and coalesce(b.duplicate_status, '') <> 'duplicate'
      and coalesce(a.is_hidden, false) = false
      and coalesce(b.is_hidden, false) = false

    union all

    select least(a.id, b.id), greatest(a.id, b.id), 100::numeric,
           array['same_google_place_id']::text[]
    from public.locations a
    join public.locations b
      on a.id < b.id
     and nullif(a.google_place_id, '') is not null
     and a.google_place_id = b.google_place_id
    where coalesce(a.duplicate_status, '') <> 'duplicate'
      and coalesce(b.duplicate_status, '') <> 'duplicate'
      and coalesce(a.is_hidden, false) = false
      and coalesce(b.is_hidden, false) = false

    union all

    select least(a.id, b.id), greatest(a.id, b.id), 100::numeric,
           array['same_normalized_name_address']::text[]
    from public.locations a
    join public.locations b
      on a.id < b.id
     and nullif(a.normalized_name, '') is not null
     and a.normalized_name = b.normalized_name
     and nullif(a.normalized_address, '') is not null
     and a.normalized_address = b.normalized_address
     and coalesce(a.city, '') = coalesce(b.city, '')
     and coalesce(a.state, '') = coalesce(b.state, '')
    where coalesce(a.duplicate_status, '') <> 'duplicate'
      and coalesce(b.duplicate_status, '') <> 'duplicate'
      and coalesce(a.is_hidden, false) = false
      and coalesce(b.is_hidden, false) = false

    union all

    select least(a.id, b.id), greatest(a.id, b.id), 95::numeric,
           array['same_phone']::text[]
    from public.locations a
    join public.locations b
      on a.id < b.id
     and nullif(a.normalized_phone, '') is not null
     and a.normalized_phone = b.normalized_phone
     and nullif(a.normalized_name, '') is not null
     and a.normalized_name = b.normalized_name
    where coalesce(a.duplicate_status, '') <> 'duplicate'
      and coalesce(b.duplicate_status, '') <> 'duplicate'
      and coalesce(a.is_hidden, false) = false
      and coalesce(b.is_hidden, false) = false
  ), grouped as (
    select location_a_id,
           location_b_id,
           max(duplicate_score) as duplicate_score,
           array_agg(distinct reason) as match_reasons
    from candidates c
    cross join lateral unnest(c.match_reasons) reason
    group by location_a_id, location_b_id
    order by max(duplicate_score) desc, location_a_id, location_b_id
    limit v_limit
  ), enriched as (
    select g.location_a_id,
           g.location_b_id,
           g.duplicate_score,
           g.match_reasons
             || case when coalesce(a.is_searchable, false) and coalesce(b.is_searchable, false)
                     then array['both_searchable']::text[] else '{}'::text[] end as match_reasons,
           case
             when (
               case when nullif(a.google_place_id, '') is not null then 1 else 0 end,
               case when coalesce(cardinality(a.images), 0) > 0 or nullif(coalesce(a.main_image, a.image_url), '') is not null then 1 else 0 end,
               coalesce(a.quality_score, 0),
               coalesce(a.review_count, 0),
               case when coalesce(a.is_searchable, false) then 1 else 0 end
             ) >= (
               case when nullif(b.google_place_id, '') is not null then 1 else 0 end,
               case when coalesce(cardinality(b.images), 0) > 0 or nullif(coalesce(b.main_image, b.image_url), '') is not null then 1 else 0 end,
               coalesce(b.quality_score, 0),
               coalesce(b.review_count, 0),
               case when coalesce(b.is_searchable, false) then 1 else 0 end
             ) then a.id else b.id
           end as suggested_master_id
    from grouped g
    join public.locations a on a.id = g.location_a_id
    join public.locations b on b.id = g.location_b_id
  ), upserted as (
    insert into public.location_duplicate_review(
      location_a_id, location_b_id, suggested_master_id,
      duplicate_score, match_reasons, updated_at
    )
    select location_a_id, location_b_id, suggested_master_id,
           duplicate_score, match_reasons, now()
    from enriched
    on conflict (location_a_id, location_b_id) do update
      set suggested_master_id = excluded.suggested_master_id,
          duplicate_score = greatest(public.location_duplicate_review.duplicate_score, excluded.duplicate_score),
          match_reasons = (
            select array_agg(distinct reason)
            from unnest(public.location_duplicate_review.match_reasons || excluded.match_reasons) reason
          ),
          updated_at = now()
      where public.location_duplicate_review.status = 'pending'
    returning 1
  )
  select count(*) into v_changed from upserted;

  select count(*) into v_pending
  from public.location_duplicate_review
  where status = 'pending';

  return jsonb_build_object(
    'scan_mode', 'fast_indexed',
    'limit_used', v_limit,
    'inserted_or_updated', v_changed,
    'pending_total', v_pending
  );
end;
$$;

revoke all on function public.oh_find_live_location_duplicates_fast(integer) from public;
grant execute on function public.oh_find_live_location_duplicates_fast(integer) to service_role;
