begin;

alter table public.locations
  add column if not exists menu_url_source text,
  add column if not exists menu_discovery_status text,
  add column if not exists menu_discovery_confidence numeric,
  add column if not exists menu_discovery_checked_at timestamptz,
  add column if not exists menu_discovery_error text,
  add column if not exists menu_content_hash text,
  add column if not exists menu_intelligence_checked_at timestamptz,
  add column if not exists menu_intelligence_version text;

alter table public.locations
  drop constraint if exists locations_menu_discovery_status_check;

alter table public.locations
  add constraint locations_menu_discovery_status_check
  check (
    menu_discovery_status is null
    or menu_discovery_status in ('pending', 'found', 'not_found', 'blocked', 'failed', 'stale')
  );

create index if not exists idx_locations_menu_discovery_backfill
  on public.locations (menu_discovery_checked_at asc nulls first, id)
  where deleted_at is null
    and location_type = 'restaurant'
    and website is not null;

comment on column public.locations.menu_url_source is
  'Provenance for menu_url, e.g. owner, admin, website_jsonld, website_link, website_linked_provider, website_common_path.';
comment on column public.locations.menu_discovery_status is
  'State for bounded official-website menu discovery: pending, found, not_found, blocked, failed, or stale.';
comment on column public.locations.menu_content_hash is
  'SHA-256 hash of normalized first-party menu content used to avoid redundant search-intelligence rebuilds.';
comment on column public.locations.menu_intelligence_version is
  'Version of deterministic first-party menu intelligence extraction applied to this location.';

-- The canonical search profile already rebuilds from these fields. Include the
-- two menu-enrichment fields that were previously missing from the trigger so
-- menu-only intelligence changes are never stranded outside the profile queue.
drop trigger if exists locations_enqueue_search_profile on public.locations;
create trigger locations_enqueue_search_profile
  after insert or update of
    location_type,
    restaurant_name,
    activity_name,
    primary_category,
    primary_tag,
    activity_type,
    cuisine,
    cuisine_type,
    tags,
    vibe_tags,
    best_for_tags,
    date_style_tags,
    search_keywords,
    signature_items,
    special_features,
    google_types,
    semantic_tags,
    intent_tags,
    description,
    public_visibility_tier,
    curation_tier,
    source_quality_status,
    quality_status,
    data_status,
    status,
    is_searchable,
    is_hidden,
    is_low_level,
    active,
    deleted_at,
    market,
    city,
    neighborhood,
    borough,
    county,
    state,
    latitude,
    longitude
  on public.locations
  for each row
  execute function public.enqueue_location_search_profile_refresh();

commit;
