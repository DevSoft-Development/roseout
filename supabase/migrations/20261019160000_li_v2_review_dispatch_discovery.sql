-- Safe service-only discovery of operator-reserved initial review tasks.
-- This function does not spend or change state.
create or replace function public.li_v2_pending_initial_review_dispatch(p_limit integer default 10)
returns table(stage_id uuid, ledger_id uuid, status text)
language sql security definer set search_path = '' as $$
 select t.stage_id,t.id,t.status from private.li_v2_initial_review_tasks t
 where t.status in ('reserved','submitted')
 order by t.created_at,t.id limit greatest(0,least(coalesce(p_limit,10),10))
$$;
revoke all on function public.li_v2_pending_initial_review_dispatch(integer) from public,anon,authenticated;
grant execute on function public.li_v2_pending_initial_review_dispatch(integer) to service_role;
