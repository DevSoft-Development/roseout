create or replace function public.prune_completed_search_anchor_reconciliation(
  p_retention_days integer default 30,
  p_limit integer default 1000
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  with doomed as (
    select id
    from public.search_anchor_reconciliation_queue
    where status = 'completed'
      and updated_at < now() - make_interval(days => greatest(1, p_retention_days))
    order by updated_at asc
    limit least(greatest(1, p_limit), 5000)
  )
  delete from public.search_anchor_reconciliation_queue q
  using doomed
  where q.id = doomed.id;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.prune_completed_search_anchor_reconciliation(integer, integer) from public;
grant execute on function public.prune_completed_search_anchor_reconciliation(integer, integer) to service_role;
