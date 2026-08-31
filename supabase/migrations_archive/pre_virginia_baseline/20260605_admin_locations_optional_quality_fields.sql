-- Add optional admin/location quality fields defensively for older schemas.
-- This migration intentionally avoids destructive changes and strict constraints.

DO $$
BEGIN
  IF to_regclass('public.locations') IS NOT NULL THEN
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS quality_status text DEFAULT 'needs_review';
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS has_photos boolean DEFAULT false;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS photo_status text DEFAULT 'missing_photo';
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS is_low_level boolean DEFAULT false;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS low_level_reason text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS public_visibility_tier text DEFAULT 'standard';
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS curation_tier text DEFAULT 'standard';
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS source_quality_status text DEFAULT 'unknown';
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS import_confidence text DEFAULT 'unknown';
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS review_count numeric;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS click_count integer DEFAULT 0;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS trend_score numeric DEFAULT 0;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS conversion_score numeric DEFAULT 0;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS review_score numeric DEFAULT 0;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS popularity_score numeric DEFAULT 0;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS ranking_badge text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS missing_fields text[];
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS last_quality_check_at timestamptz;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS is_claimed boolean DEFAULT false;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS claimed boolean DEFAULT false;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS claim_status text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS claimed_by_email text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS owner_user_id uuid;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS primary_tag text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS google_place_id text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS claim_code text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS tags text[];
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS google_types text[];
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS main_image text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS image_url text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS images text[];
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS category text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS food_type text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS activity_type text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS cuisine_type text;
    ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS curation_notes text;
  END IF;
END $$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['restaurants', 'activities'] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS quality_status text DEFAULT %L', table_name, 'needs_review');
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS has_photos boolean DEFAULT false', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS photo_status text DEFAULT %L', table_name, 'missing_photo');
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_low_level boolean DEFAULT false', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS low_level_reason text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS public_visibility_tier text DEFAULT %L', table_name, 'standard');
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS curation_tier text DEFAULT %L', table_name, 'standard');
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS source_quality_status text DEFAULT %L', table_name, 'unknown');
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS import_confidence text DEFAULT %L', table_name, 'unknown');
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS review_count numeric', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS view_count integer DEFAULT 0', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS click_count integer DEFAULT 0', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS trend_score numeric DEFAULT 0', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS conversion_score numeric DEFAULT 0', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS review_score numeric DEFAULT 0', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS popularity_score numeric DEFAULT 0', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS ranking_badge text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS missing_fields text[]', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS last_quality_check_at timestamptz', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_claimed boolean DEFAULT false', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS claimed boolean DEFAULT false', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS claim_status text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS claimed_at timestamptz', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS claimed_by_email text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS owner_user_id uuid', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS primary_tag text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS google_place_id text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS claim_code text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tags text[]', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS google_types text[]', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS main_image text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS image_url text', table_name);
      EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS images text[]', table_name);
    END IF;
  END LOOP;
END $$;

DO $$
BEGIN
  IF to_regclass('public.restaurants') IS NOT NULL THEN
    ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS food_type text;
    ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS cuisine text;
    ALTER TABLE public.restaurants ADD COLUMN IF NOT EXISTS cuisine_type text;
  END IF;

  IF to_regclass('public.activities') IS NOT NULL THEN
    ALTER TABLE public.activities ADD COLUMN IF NOT EXISTS activity_type text;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.locations') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS locations_quality_status_idx ON public.locations(quality_status);
    CREATE INDEX IF NOT EXISTS locations_photo_status_idx ON public.locations(photo_status);
    CREATE INDEX IF NOT EXISTS locations_is_low_level_idx ON public.locations(is_low_level);
    CREATE INDEX IF NOT EXISTS locations_source_table_idx ON public.locations(source_table);
    CREATE INDEX IF NOT EXISTS locations_location_type_idx ON public.locations(location_type);
  END IF;
END $$;
