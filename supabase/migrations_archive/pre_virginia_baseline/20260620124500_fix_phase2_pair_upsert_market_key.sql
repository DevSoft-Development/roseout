alter table public.location_pair_ml_features
add column if not exists market_key text not null default '';

update public.location_pair_ml_features
set market_key = coalesce(market, '')
where market_key is distinct from coalesce(market, '');

create unique index if not exists location_pair_ml_features_upsert_key_idx
on public.location_pair_ml_features (
  restaurant_location_id,
  activity_location_id,
  intent_bucket,
  market_key
);
