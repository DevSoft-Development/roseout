-- Make first-party menu signature items retrievable by the existing clean-search-v1
-- text search without introducing a second lookup path.
--
-- A deterministic suffix is maintained on search_document and semantic_search_text.
-- Rebuilding the suffix on every relevant update prevents removed/renamed menu items
-- from remaining searchable indefinitely.

create or replace function public.sync_location_signature_search_text()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_marker constant text := '__menu_signature_items__';
  v_signature_text text;
  v_search_base text;
  v_semantic_base text;
begin
  v_signature_text := trim(array_to_string(coalesce(new.signature_items, '{}'::text[]), ' '));

  v_search_base := trim(
    regexp_replace(
      coalesce(new.search_document, ''),
      '\s*__menu_signature_items__\s+.*$',
      '',
      'i'
    )
  );

  v_semantic_base := trim(
    regexp_replace(
      coalesce(new.semantic_search_text, ''),
      '\s*__menu_signature_items__\s+.*$',
      '',
      'i'
    )
  );

  if v_signature_text <> '' then
    new.search_document := trim(concat_ws(' ', nullif(v_search_base, ''), v_marker, v_signature_text));
    new.semantic_search_text := trim(concat_ws(' ', nullif(v_semantic_base, ''), v_marker, v_signature_text));
  else
    new.search_document := nullif(v_search_base, '');
    new.semantic_search_text := nullif(v_semantic_base, '');
  end if;

  return new;
end;
$$;

revoke all on function public.sync_location_signature_search_text() from public, anon, authenticated;

drop trigger if exists trg_sync_location_signature_search_text on public.locations;
create trigger trg_sync_location_signature_search_text
before insert or update of signature_items, search_document, semantic_search_text
on public.locations
for each row
execute function public.sync_location_signature_search_text();

-- Backfill existing menu-enriched locations through the same trigger logic.
update public.locations
set signature_items = signature_items
where cardinality(coalesce(signature_items, '{}'::text[])) > 0;
