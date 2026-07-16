-- Keep location searchability consistent with visibility and quality controls.
-- This migration repairs historical contradictions and prevents future writes
-- from marking hidden, low-level, deleted, or terminal-status rows searchable.

create or replace function public.oh_enforce_location_search_visibility()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if