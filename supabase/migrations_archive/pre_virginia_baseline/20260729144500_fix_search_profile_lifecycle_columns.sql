-- Align Search Foundation V3 with the canonical locations lifecycle columns.
-- This is additive and safe to rerun through migration tooling.

create or replace function public.enterprise_search_profile_candidates(
  p_query text,
  p_limit integer default 100,
  p_market text default null,
  p_state text default null,
  p_city text default null,
  p_domains text[] default null,
  p_categories text[] default null,
  p_audiences text[] default null
)
returns table(
  location_id uuid,
  primary_domain text,
  confidence numeric,
  retrieval_rank real
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    p.location_id,
    p.primary_domain,
    p.confidence,
    ts_rank_cd(p.search_tsv, websearch_to_tsquery('simple', coalesce(p_query, '')))
  from public.location_search_profiles p
  join public.locations l on l.id = p.location_id
  where coalesce(l.active, true)
    and coalesce(l.is_searchable, false)
    and not coalesce(l.is_hidden, false)
    and not coalesce(l.is_low_level, false)
    and (p_market is null or p.market = p_market)
    and (p_state is null or p.state = p_state)
    and (p_city is null or p.city = p_city)
    and (p_domains is null or p.supported_domains && p_domains)
    and (p_categories is null or p.canonical_terms && p_categories)
    and (p_audiences is null or p.audiences && p_audiences)
    and (
      coalesce(p_query, '') = ''
      or p.search_tsv @@ websearch_to_tsquery('simple', p_query)
    )
  order by retrieval_rank desc, p.confidence desc, p.location_id
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.enterprise_search_profile_candidates(
  text,
  integer,
  text,
  text,
  text,
  text[],
  text[],
  text[]
) from public, anon, authenticated;

grant execute on function public.enterprise_search_profile_candidates(
  text,
  integer,
  text,
  text,
  text,
  text[],
  text[],
  text[]
) to service_role;
