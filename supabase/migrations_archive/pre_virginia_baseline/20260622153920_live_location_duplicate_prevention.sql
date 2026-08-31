create extension if not exists pg_trgm;
create extension if not exists unaccent;

create table if not exists public.location_duplicate_review (
  id uuid primary key default gen_random_uuid(),
  location_a_id uuid not null references public.locations(id) on delete cascade,
  location_b_id uuid not null references public.locations(id) on delete cascade,
  suggested_master_id uuid references public.locations(id) on delete set null,
  duplicate_score numeric not null default 0,
  match_reasons text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','merged','ignored','not_duplicate')),
  decision_reason text,
  decided_by uuid null,
  decided_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint location_duplicate_review_order_chk check (location_a_id < location_b_id),
  unique(location_a_id, location_b_id)
);

create index if not exists location_duplicate_review_status_idx on public.location_duplicate_review(status);
create index if not exists location_duplicate_review_score_idx on public.location_duplicate_review(duplicate_score desc);
create index if not exists location_duplicate_review_a_idx on public.location_duplicate_review(location_a_id);
create index if not exists location_duplicate_review_b_idx on public.location_duplicate_review(location_b_id);
create index if not exists location_duplicate_review_master_idx on public.location_duplicate_review(suggested_master_id);

alter table public.location_duplicate_review enable row level security;
drop policy if exists "Admins can manage location duplicate review" on public.location_duplicate_review;
create policy "Admins can manage location duplicate review" on public.location_duplicate_review
for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin')))
with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','superadmin')));

create or replace function public.oh_refresh_location_identity()
returns integer language plpgsql security definer as $$
declare updated_count integer;
begin
  update public.locations l
  set normalized_name = public.oh_normalize_text(coalesce(l.name, l.restaurant_name, l.activity_name)),
      normalized_address = public.oh_normalize_text(l.address),
      normalized_phone = public.oh_normalize_phone(l.phone),
      location_key = public.oh_location_key(coalesce(l.name, l.restaurant_name, l.activity_name), l.address, l.city, l.state)
  where l.normalized_name is distinct from public.oh_normalize_text(coalesce(l.name, l.restaurant_name, l.activity_name))
     or l.normalized_address is distinct from public.oh_normalize_text(l.address)
     or l.normalized_phone is distinct from public.oh_normalize_phone(l.phone)
     or l.location_key is distinct from public.oh_location_key(coalesce(l.name, l.restaurant_name, l.activity_name), l.address, l.city, l.state);
  get diagnostics updated_count = row_count;
  return updated_count;
end; $$;

create or replace function public.oh_find_live_location_duplicates(p_limit integer default 500)
returns integer language plpgsql security definer as $$
declare inserted_count integer;
begin
  perform public.oh_refresh_location_identity();
  with candidate_pairs as (
    select least(a.id,b.id) location_a_id, greatest(a.id,b.id) location_b_id,
      greatest(
        case when a.location_key is not null and a.location_key = b.location_key then 100 else 0 end,
        case when nullif(a.google_place_id,'') is not null and a.google_place_id = b.google_place_id then 100 else 0 end,
        case when nullif(a.normalized_name,'') is not null and a.normalized_name = b.normalized_name and a.normalized_address = b.normalized_address and coalesce(upper(a.state),'') = coalesce(upper(b.state),'') then 100 else 0 end,
        case when a.normalized_phone is not null and a.normalized_phone = b.normalized_phone and similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) >= 0.72 then 95 else 0 end,
        case when nullif(a.normalized_address,'') is not null and a.normalized_address = b.normalized_address and coalesce(public.oh_normalize_text(a.city),'') = coalesce(public.oh_normalize_text(b.city),'') and coalesce(upper(a.state),'') = coalesce(upper(b.state),'') and similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) >= 0.72 then round(72 + (similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) * 17)) else 0 end
      ) as duplicate_score,
      array_remove(array[
        case when a.location_key is not null and a.location_key = b.location_key then 'same_location_key' end,
        case when nullif(a.google_place_id,'') is not null and a.google_place_id = b.google_place_id then 'same_google_place_id' end,
        case when nullif(a.normalized_name,'') is not null and a.normalized_name = b.normalized_name and a.normalized_address = b.normalized_address and coalesce(upper(a.state),'') = coalesce(upper(b.state),'') then 'same_normalized_name_address' end,
        case when a.normalized_phone is not null and a.normalized_phone = b.normalized_phone then 'same_phone' end,
        case when nullif(a.normalized_address,'') is not null and a.normalized_address = b.normalized_address and similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) >= 0.72 then 'similar_name_same_address' end,
        case when coalesce(a.is_searchable,false) and coalesce(b.is_searchable,false) then 'both_searchable' end,
        case when coalesce(a.location_type,'') <> coalesce(b.location_type,'') and (coalesce(a.location_type,'') in ('restaurant','activity','nightlife') or coalesce(b.location_type,'') in ('restaurant','activity','nightlife')) then 'cross_type_restaurant_activity' end
      ], null) as match_reasons,
      case when (case when a.google_place_id is not null then 1 else 0 end, case when coalesce(cardinality(a.images),0) > 0 or nullif(coalesce(a.main_image,a.image_url),'') is not null then 1 else 0 end, coalesce(a.quality_score,0), coalesce(a.review_count,0), case when coalesce(a.is_searchable,false) then 1 else 0 end, -extract(epoch from coalesce(a.created_at, now()))) >=
                (case when b.google_place_id is not null then 1 else 0 end, case when coalesce(cardinality(b.images),0) > 0 or nullif(coalesce(b.main_image,b.image_url),'') is not null then 1 else 0 end, coalesce(b.quality_score,0), coalesce(b.review_count,0), case when coalesce(b.is_searchable,false) then 1 else 0 end, -extract(epoch from coalesce(b.created_at, now()))) then a.id else b.id end suggested_master_id
    from public.locations a
    join public.locations b on a.id < b.id and (
      (a.location_key is not null and a.location_key = b.location_key) or
      (nullif(a.google_place_id,'') is not null and a.google_place_id = b.google_place_id) or
      (nullif(a.normalized_name,'') is not null and a.normalized_name = b.normalized_name and a.normalized_address = b.normalized_address and coalesce(upper(a.state),'') = coalesce(upper(b.state),'')) or
      (a.normalized_phone is not null and a.normalized_phone = b.normalized_phone and similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) >= 0.72) or
      (nullif(a.normalized_address,'') is not null and a.normalized_address = b.normalized_address and coalesce(public.oh_normalize_text(a.city),'') = coalesce(public.oh_normalize_text(b.city),'') and coalesce(upper(a.state),'') = coalesce(upper(b.state),'') and similarity(coalesce(a.normalized_name,''), coalesce(b.normalized_name,'')) >= 0.72)
    )
    where coalesce(a.duplicate_status,'') <> 'duplicate' and coalesce(b.duplicate_status,'') <> 'duplicate'
      and (not exists(select 1 from information_schema.columns where table_schema='public' and table_name='locations' and column_name='deleted_at') or (to_jsonb(a)->>'deleted_at') is null and (to_jsonb(b)->>'deleted_at') is null)
    order by duplicate_score desc limit greatest(1, least(coalesce(p_limit,500), 5000))
  )
  insert into public.location_duplicate_review(location_a_id, location_b_id, suggested_master_id, duplicate_score, match_reasons, updated_at)
  select location_a_id, location_b_id, suggested_master_id, duplicate_score, match_reasons, now() from candidate_pairs where duplicate_score >= 70
  on conflict (location_a_id, location_b_id) do update set suggested_master_id=excluded.suggested_master_id, duplicate_score=excluded.duplicate_score, match_reasons=excluded.match_reasons, updated_at=now() where location_duplicate_review.status='pending';
  get diagnostics inserted_count = row_count;
  return inserted_count;
end; $$;

create or replace function public.oh_merge_live_location_duplicate(p_master_id uuid, p_duplicate_id uuid, p_reason text default 'admin_merge')
returns jsonb language plpgsql security definer as $$
declare merged text[] := '{}'; a uuid; b uuid;
begin
  if p_master_id = p_duplicate_id then raise exception 'master and duplicate must differ'; end if;
  if not exists(select 1 from public.locations where id=p_master_id) or not exists(select 1 from public.locations where id=p_duplicate_id) then raise exception 'location not found'; end if;

  update public.locations m set
    tags = (select array(select distinct x from unnest(coalesce(m.tags,'{}') || coalesce(d.tags,'{}') || array_remove(array[d.primary_category,d.cuisine,d.cuisine_type,d.activity_type,d.primary_tag,d.location_type], null)) x where nullif(trim(x),'') is not null)),
    vibe_tags = (select array(select distinct x from unnest(coalesce(m.vibe_tags,'{}') || coalesce(d.vibe_tags,'{}')) x where nullif(trim(x),'') is not null)),
    best_for_tags = (select array(select distinct x from unnest(coalesce(m.best_for_tags,'{}') || coalesce(d.best_for_tags,'{}')) x where nullif(trim(x),'') is not null)),
    search_keywords = (select array(select distinct x from unnest(coalesce(m.search_keywords,'{}') || coalesce(d.search_keywords,'{}') || array_remove(array[d.primary_category,d.cuisine,d.cuisine_type,d.activity_type,d.primary_tag,d.location_type], null)) x where nullif(trim(x),'') is not null)),
    google_types = (select array(select distinct x from unnest(coalesce(m.google_types,'{}') || coalesce(d.google_types,'{}')) x where nullif(trim(x),'') is not null)),
    images = (select array(select distinct x from unnest(coalesce(m.images,'{}') || coalesce(d.images,'{}')) x where nullif(trim(x),'') is not null)),
    primary_category = coalesce(nullif(m.primary_category,''), nullif(d.primary_category,'')), cuisine = coalesce(nullif(m.cuisine,''), nullif(d.cuisine,'')), cuisine_type = coalesce(nullif(m.cuisine_type,''), nullif(d.cuisine_type,'')), activity_type = coalesce(nullif(m.activity_type,''), nullif(d.activity_type,'')), primary_tag = coalesce(nullif(m.primary_tag,''), nullif(d.primary_tag,'')),
    main_image = coalesce(nullif(m.main_image,''), nullif(d.main_image,'')), image_url = coalesce(nullif(m.image_url,''), nullif(d.image_url,'')), phone = coalesce(nullif(m.phone,''), nullif(d.phone,'')), website = coalesce(nullif(m.website,''), nullif(d.website,'')), instagram_url = coalesce(nullif(m.instagram_url,''), nullif(d.instagram_url,'')), reservation_url = coalesce(nullif(m.reservation_url,''), nullif(d.reservation_url,'')), reservation_link = coalesce(nullif(m.reservation_link,''), nullif(d.reservation_link,'')), external_reservation_url = coalesce(nullif(m.external_reservation_url,''), nullif(d.external_reservation_url,'')),
    quality_score = greatest(coalesce(m.quality_score,0), coalesce(d.quality_score,0)), review_count = greatest(coalesce(m.review_count,0), coalesce(d.review_count,0)), rating = greatest(coalesce(m.rating,0), coalesce(d.rating,0)), updated_at = now()
  from public.locations d where m.id=p_master_id and d.id=p_duplicate_id;
  merged := array['tags','vibe_tags','best_for_tags','search_keywords','google_types','images','category_fields','photo_fields','business_metadata','scores'];

  update public.locations set duplicate_status='duplicate', duplicate_of=p_master_id, is_searchable=false, is_hidden=true, last_deduped_at=now(), updated_at=now() where id=p_duplicate_id;
  a := least(p_master_id,p_duplicate_id); b := greatest(p_master_id,p_duplicate_id);
  update public.location_duplicate_review set status='merged', suggested_master_id=p_master_id, decision_reason=p_reason, decided_at=now(), updated_at=now() where location_a_id=a and location_b_id=b;
  return jsonb_build_object('success', true, 'master_id', p_master_id, 'duplicate_id', p_duplicate_id, 'merged_fields', merged, 'hidden_duplicate', true);
end; $$;

create or replace function public.oh_ignore_live_location_duplicate(p_location_a_id uuid, p_location_b_id uuid, p_status text default 'ignored', p_reason text default null)
returns jsonb language plpgsql security definer as $$
declare a uuid := least(p_location_a_id,p_location_b_id); b uuid := greatest(p_location_a_id,p_location_b_id);
begin
  if p_status not in ('ignored','not_duplicate') then raise exception 'invalid duplicate review status'; end if;
  update public.location_duplicate_review set status=p_status, decision_reason=p_reason, decided_at=now(), updated_at=now() where location_a_id=a and location_b_id=b;
  return jsonb_build_object('success', true, 'location_a_id', a, 'location_b_id', b, 'status', p_status);
end; $$;

create or replace function public.oh_prevent_searchable_exact_duplicate()
returns trigger language plpgsql security definer as $$
declare existing_id uuid;
begin
  new.normalized_name := public.oh_normalize_text(coalesce(new.name, new.restaurant_name, new.activity_name));
  new.normalized_address := public.oh_normalize_text(new.address);
  new.normalized_phone := public.oh_normalize_phone(new.phone);
  new.location_key := public.oh_location_key(coalesce(new.name, new.restaurant_name, new.activity_name), new.address, new.city, new.state);
  if coalesce(new.is_searchable,false) and coalesce(new.duplicate_status,'') <> 'duplicate' then
    select l.id into existing_id from public.locations l where l.id <> coalesce(new.id, gen_random_uuid()) and coalesce(l.duplicate_status,'') <> 'duplicate' and coalesce(l.is_searchable,false) and ((new.location_key is not null and l.location_key = new.location_key) or (new.normalized_name = l.normalized_name and new.normalized_address = l.normalized_address and coalesce(public.oh_normalize_text(new.city),'') = coalesce(public.oh_normalize_text(l.city),'') and coalesce(upper(new.state),'') = coalesce(upper(l.state),''))) and (not exists(select 1 from information_schema.columns where table_schema='public' and table_name='locations' and column_name='deleted_at') or (to_jsonb(l)->>'deleted_at') is null) limit 1;
    if existing_id is not null then
      new.is_searchable := false;
      if coalesce(new.duplicate_status,'unknown') in ('unknown','unique','') then new.duplicate_status := 'possible_duplicate'; end if;
      new.duplicate_of := existing_id;
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_prevent_searchable_exact_duplicate on public.locations;
create trigger trg_prevent_searchable_exact_duplicate before insert or update of name, restaurant_name, activity_name, address, city, state, phone, is_searchable, duplicate_status on public.locations for each row execute function public.oh_prevent_searchable_exact_duplicate();

create or replace function public.oh_auto_merge_exact_live_duplicates(p_limit integer default 100)
returns integer language plpgsql security definer as $$
declare r record; merge_count integer := 0;
begin
  perform public.oh_find_live_location_duplicates(p_limit);
  for r in select * from public.location_duplicate_review where status='pending' and duplicate_score >= 100 and suggested_master_id is not null and match_reasons && array['same_location_key','same_google_place_id','same_normalized_name_address'] order by duplicate_score desc, created_at asc limit greatest(1, least(coalesce(p_limit,100),500)) loop
    perform public.oh_merge_live_location_duplicate(r.suggested_master_id, case when r.location_a_id = r.suggested_master_id then r.location_b_id else r.location_a_id end, 'auto_merge_exact_live_duplicates');
    merge_count := merge_count + 1;
  end loop;
  return merge_count;
end; $$;
