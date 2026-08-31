-- Remove legacy Roseout branding from searchable/user-facing location text.
-- Idempotent and intentionally narrow: legacy DB columns such as roseout_score are kept.

do $$
declare
  target_table text;
  target_column text;
begin
  foreach target_table in array array['restaurants', 'activities'] loop
    foreach target_column in array array['search_keywords', 'tags', 'semantic_tags', 'intent_tags'] loop
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = target_column
          and data_type = 'ARRAY'
      ) then
        execute format(
          $sql$
          update public.%I
             set %I = array_remove(array_remove(array_remove(array_remove(%I, 'roseout'), 'Roseout'), 'ROSEOUT'), 'rose out')
           where exists (
             select 1 from unnest(%I) as token where token ~* '^(roseout|rose out)$'
           )
          $sql$,
          target_table, target_column, target_column, target_column
        );
      end if;
    end loop;

    foreach target_column in array array['search_document', 'semantic_search_text', 'description'] loop
      if exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = target_table
          and column_name = target_column
          and data_type in ('text', 'character varying')
      ) then
        execute format(
          $sql$
          update public.%I
             set %I = btrim(regexp_replace(regexp_replace(regexp_replace(regexp_replace(%I, '(www\.)?roseout\.vercel\.app', 'theouthaven.com', 'gi'), 'www\.roseout\.com', 'www.theouthaven.com', 'gi'), 'roseout\.com', 'theouthaven.com', 'gi'), 'rose\s*out|roseout', 'TheOutHaven', 'gi'))
           where %I ~* 'rose\s*out|roseout'
          $sql$,
          target_table, target_column, target_column, target_column
        );
      end if;
    end loop;
  end loop;
end $$;
