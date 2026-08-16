-- Reconcile aggregate public bar/counter booking rows from the authoritative layout containers.
-- Exact stool inventory remains in reservation_seating_resources.

do $$
declare
  r record;
begin
  for r in
    select id
    from public.layout_items
    where public.reserve_is_bar_type(item_type)
  loop
    perform public.reserve_sync_bar_bookable_item(r.id);
  end loop;
end $$;
