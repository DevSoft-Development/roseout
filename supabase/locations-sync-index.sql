-- Required for app/api/admin/sync-locations to upsert one public locations row
-- per source restaurants/activities row using onConflict: "source_table,source_id".
create unique index if not exists locations_source_table_source_id_idx
  on public.locations (source_table, source_id);
