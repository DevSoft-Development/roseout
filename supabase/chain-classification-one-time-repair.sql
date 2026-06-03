update public.locations
set chain_classified_at = now(),
    chain_classification_reason = coalesce(chain_classification_reason, 'Backfilled classification progress for previously classified record.'),
    chain_confidence = coalesce(chain_confidence, 0.85)
where chain_classified_at is null
  and (
    is_chain is not null
    or brand_type is not null
    or chain_brand is not null
  );

update public.location_import_staging
set chain_classified_at = now(),
    chain_classification_reason = coalesce(chain_classification_reason, 'Backfilled classification progress for previously classified staging record.'),
    chain_confidence = coalesce(chain_confidence, 0.85)
where chain_classified_at is null
  and (
    is_chain is not null
    or brand_type is not null
    or chain_brand is not null
  );
