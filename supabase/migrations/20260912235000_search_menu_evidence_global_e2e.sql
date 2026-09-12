-- Global menu-evidence contract for Search V2.
-- Owner-published menu items are authoritative, website/profile menu evidence remains supported,
-- and stale owner embeddings are invalidated on every canonical commerce change.

create or replace function public.get_hf_menu_embedding_backfill_candidates(
  p_limit integer default 100,
  p_embedding_version text default 'hf-bge-small-en-v1.5:v2'
)
returns table(location_id uuid,item_name text,source text)
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select i.location_id, trim(i.name) as item_name, 'owner_published_menu'::text as source, 0 as priority
    from public.location_commerce_items i
    join public.location_commerce_pages p on p.id = i.commerce_page_id and p.location_id = i.location_id
    join public.locations l on l.id = i.location_id
    where p.status = 'published'
      and coalesce(p.is_active,false) = true
      and coalesce(i.is_available,true) = true
      and nullif(trim(i.name),'') is not null
      and coalesce(l.is_searchable,true) = true
      and coalesce(l.is_hidden,false) = false
      and coalesce(l.active,true) = true
      and l.deleted_at is null

    union all

    select l.id, trim(i.item_name), 'signature_item'::text, 1
    from public.locations l
    cross join lateral unnest(coalesce(l.signature_items,'{}'::text[])) as i(item_name)
    where coalesce(l.is_searchable,true) = true
      and coalesce(l.is_hidden,false) = false
      and coalesce(l.active,true) = true
      and l.deleted_at is null
      and nullif(trim(i.item_name),'') is not null

    union all

    select p.location_id, trim(i.item_name), 'search_profile_food'::text, 2
    from public.location_search_profiles p
    cross join lateral unnest(coalesce(p.foods,'{}'::text[])) as i(item_name)
    where nullif(trim(i.item_name),'') is not null
  ),
  deduped as (
    select distinct on (c.location_id, lower(regexp_replace(c.item_name,'\s+',' ','g')))
      c.location_id,c.item_name,c.source,c.priority
    from candidates c
    order by c.location_id, lower(regexp_replace(c.item_name,'\s+',' ','g')), c.priority asc
  )
  select d.location_id,d.item_name,d.source
  from deduped d
  left join public.location_menu_item_embeddings_hf e
    on e.location_id = d.location_id
   and e.normalized_item_name = lower(regexp_replace(d.item_name,'\s+',' ','g'))
  where e.location_id is null
     or e.embedding_version is distinct from p_embedding_version
     or e.status is distinct from 'ready'
     or e.source is distinct from d.source
  order by d.priority asc,d.location_id,d.item_name
  limit greatest(1,least(coalesce(p_limit,100),500));
$$;

revoke all on function public.get_hf_menu_embedding_backfill_candidates(integer,text) from public,anon,authenticated;
grant execute on function public.get_hf_menu_embedding_backfill_candidates(integer,text) to service_role;

create or replace function public.invalidate_owner_menu_search_embeddings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_location_id uuid;
begin
  if tg_op = 'DELETE' then
    v_location_id := old.location_id;
  else
    v_location_id := new.location_id;
  end if;

  if v_location_id is not null then
    delete from public.location_menu_item_embeddings_hf
    where location_id = v_location_id
      and source = 'owner_published_menu';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.invalidate_owner_menu_search_embeddings() from public,anon,authenticated;
grant execute on function public.invalidate_owner_menu_search_embeddings() to service_role;

drop trigger if exists trg_search_owner_menu_items_changed on public.location_commerce_items;
create trigger trg_search_owner_menu_items_changed
after insert or update or delete on public.location_commerce_items
for each row execute function public.invalidate_owner_menu_search_embeddings();

drop trigger if exists trg_search_owner_menu_pages_changed on public.location_commerce_pages;
create trigger trg_search_owner_menu_pages_changed
after insert or update or delete on public.location_commerce_pages
for each row execute function public.invalidate_owner_menu_search_embeddings();
