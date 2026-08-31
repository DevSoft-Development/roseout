-- Production search log IDs may be UUIDs while older environments used bigint IDs.
-- Store the replay reference as text so both formats are supported consistently.

alter table public.search_quality_replay_items
  alter column source_search_id type text
  using source_search_id::text;

comment on column public.search_quality_replay_items.source_search_id is
  'Reference to the originating search log ID. Stored as text to support UUID and legacy numeric identifiers.';
