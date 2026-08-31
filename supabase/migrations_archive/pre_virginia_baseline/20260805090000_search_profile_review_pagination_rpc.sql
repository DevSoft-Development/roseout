-- Server-side pagination/filtering for the admin Search Profile Review Center.
create or replace function public.admin_search_profile_review_queue(
  p_search text default null,
  p_severity text default null,
  p_reason text default null,
  p_page_size integer default 25,
  p_offset integer default 0
)
returns table(
  location_id uuid,
  name text,
  location_type text,
  state text,
  city text,
  primary_domain text,
  canonical_terms text[],
  confidence numeric,
  profile_version integer,
  generated_at timestamptz,
  severity text,
  blocking_reasons text[],
  warning_reasons text[],
  filtered_count bigint,
  total_needs_review_count bigint,
  blocking_count bigint,
  warning_count bigint,
  reason_options text[]
)
language sql
stable
security invoker
set search_path = public
as $$
  with reviewed as (
    select
      p.location_id,
      coalesce(l.name, l.restaurant_name, l.activity_name, p.location_id::text) as name,
      coalesce(l.location_type, '') as location_type,
      coalesce(l.state, '') as state,
      coalesce(l.city, l.borough, '') as city,
      coalesce(p.primary_domain, '') as primary_domain,
      coalesce(p.canonical_terms, '{}'::text[]) as canonical_terms,
      p.confidence,
      p.profile_version,
      p.generated_at,
      array(
        select distinct reason
        from unnest(
          coalesce(p.review_reasons, '{}'::text[])
          || case when nullif(p.primary_domain, '') is null then array['Missing primary domain'] else '{}'::text[] end
          || case when cardinality(coalesce(p.canonical_terms, '{}'::text[])) = 0 then array['Missing canonical terms'] else '{}'::text[] end
          || case when coalesce(p.profile_version, 0) < 4 then array['Stale profile version'] else '{}'::text[] end
        ) as reason
        where reason ~* '(missing primary domain|domain conflict|unsupported domain|restaurant.*activity.*conflict|nightlife.*family|missing canonical terms|no canonical terms|invalid classification|stale profile version)'
        order by reason
      ) as blocking_reasons,
      array(
        select distinct reason
        from unnest(
          coalesce(p.review_reasons, '{}'::text[])
          || case when coalesce(p.confidence, 0) < 0.55 then array['Low confidence'] else '{}'::text[] end
        ) as reason
        where reason <> ''
          and not (reason ~* '(missing primary domain|domain conflict|unsupported domain|restaurant.*activity.*conflict|nightlife.*family|missing canonical terms|no canonical terms|invalid classification|stale profile version)')
        order by reason
      ) as warning_reasons,
      concat_ws(' ', l.name, l.restaurant_name, l.activity_name, l.location_type, l.city, l.borough, l.state, p.primary_domain, array_to_string(p.canonical_terms, ' ')) as search_blob
    from public.location_search_profiles p
    left join public.locations l on l.id = p.location_id
    where p.needs_review is true
  ), classified as (
    select *, case when cardinality(blocking_reasons) > 0 then 'blocking' when cardinality(warning_reasons) > 0 then 'warning' else 'none' end as review_severity
    from reviewed
  ), filtered as (
    select * from classified
    where (coalesce(nullif(trim(p_search), ''), '') = '' or search_blob ilike '%' || replace(replace(replace(trim(p_search), '\\', '\\\\'), '%', '\%'), '_', '\_') || '%' escape '\')
      and (coalesce(nullif(p_severity, ''), 'all') = 'all' or review_severity = p_severity)
      and (coalesce(nullif(p_reason, ''), '') = '' or p_reason = any(blocking_reasons) or p_reason = any(warning_reasons))
  ), totals as (
    select
      (select count(*) from filtered) as filtered_count,
      (select count(*) from classified) as total_needs_review_count,
      (select count(*) from filtered where review_severity = 'blocking') as blocking_count,
      (select count(*) from filtered where review_severity = 'warning') as warning_count,
      coalesce((select array_agg(distinct reason order by reason) from classified c cross join lateral unnest(c.blocking_reasons || c.warning_reasons) as reason), '{}'::text[]) as reason_options
  )
  , paged as (
    select *
    from filtered
    order by confidence asc nulls first, location_id
    limit least(greatest(p_page_size, 1), 100)
    offset greatest(p_offset, 0)
  )
  select p.location_id, p.name, p.location_type, p.state, p.city, p.primary_domain, p.canonical_terms, p.confidence, p.profile_version, p.generated_at,
    p.review_severity as severity, p.blocking_reasons, p.warning_reasons,
    t.filtered_count, t.total_needs_review_count, t.blocking_count, t.warning_count, t.reason_options
  from paged p cross join totals t
  union all
  select null::uuid, null::text, null::text, null::text, null::text, null::text, '{}'::text[], null::numeric, null::integer, null::timestamptz,
    'none'::text, '{}'::text[], '{}'::text[], t.filtered_count, t.total_needs_review_count, t.blocking_count, t.warning_count, t.reason_options
  from totals t
  where not exists (select 1 from paged);
$$;

grant execute on function public.admin_search_profile_review_queue(text,text,text,integer,integer) to service_role;
