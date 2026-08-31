begin;

create or replace function public.get_search_embedding_backfill_candidates(
  p_limit integer default 50
)
returns table(location_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select l.id
  from public.locations l
  left join public.location_search_embeddings e on e.location_id = l.id
  where coalesce(l.is_searchable, true) = true
    and coalesce(l.is_hidden, false) = false
    and coalesce(l.active, true) = true
    and l.deleted_at is null
    and lower(coalesce(l.status, '')) not in ('closed', 'permanently_closed', 'archived', 'deleted', 'hidden')
    and lower(coalesce(l.duplicate_status, '')) not in ('duplicate', 'secondary', 'merged')
  order by
    case
      when e.location_id is null then 0
      when e.status <> 'ready' then 1
      else 2
    end,
    e.calculated_at asc nulls first,
    coalesce(l.updated_at, l.created_at) asc nulls first,
    l.id
  limit greatest(1, least(coalesce(p_limit, 50), 250));
$$;

revoke all on function public.get_search_embedding_backfill_candidates(integer) from public, anon, authenticated;
grant execute on function public.get_search_embedding_backfill_candidates(integer) to service_role;

commit;
