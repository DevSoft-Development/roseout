alter table public.experience_table_blocks drop constraint if exists experience_table_blocks_no_overlap;
alter table public.experience_table_blocks
  add constraint experience_table_blocks_no_overlap
  exclude using gist (
    layout_item_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('held','confirmed'));
