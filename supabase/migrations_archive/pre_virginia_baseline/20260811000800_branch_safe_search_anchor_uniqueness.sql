drop index if exists public.search_anchors_normalized_market_unique_idx;

create unique index if not exists search_anchors_normalized_market_unique_idx
on public.search_anchors (
  normalized_name,
  coalesce(market, ''::text),
  coalesce(city, ''::text),
  coalesce(state, ''::text)
)
where linked_location_id is null;
