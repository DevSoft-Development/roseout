-- LI V2 identity collision guard; preserves legacy records and existing TOH UUIDs.
-- Apply only through approved migration workflow after review.
-- No existing locations are updated or removed.
CREATE OR REPLACE FUNCTION public.li_v2_reject_google_identity_reuse()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.import_source IS DISTINCT FROM 'li_v2_independent'
    OR nullif(btrim(NEW.google_place_id), '') IS NULL
  THEN
    RETURN NEW;
  END IF;

  -- Serialize concurrent LI V2 checks for the same identity within the transaction.
  PERFORM pg_advisory_xact_lock(hashtextextended('li_v2_google_id:' || NEW.google_place_id, 0));

  -- A Google parent-venue identity can never be silently reused for another TOH location.
  -- Preserve all prior records for provenance review, even non-searchable or duplicate-marked.
  IF EXISTS (
    SELECT 1 FROM public.locations existing
    WHERE existing.google_place_id = NEW.google_place_id
      AND existing.id IS DISTINCT FROM NEW.id
  ) THEN
    RAISE EXCEPTION 'li_v2_google_identity_already_assigned'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_li_v2_google_identity_reuse ON public.locations;
CREATE TRIGGER trg_li_v2_google_identity_reuse
BEFORE INSERT OR UPDATE OF google_place_id, import_source
ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.li_v2_reject_google_identity_reuse();

-- A separate, concurrency-safe unique constraint prevents multiple new LI V2 imports
-- from claiming an identical Google ID (including under non-trigger paths).
CREATE UNIQUE INDEX IF NOT EXISTS locations_li_v2_independent_google_id_unique
ON public.locations (google_place_id)
WHERE import_source = 'li_v2_independent'
  AND nullif(btrim(google_place_id), '') IS NOT NULL;
