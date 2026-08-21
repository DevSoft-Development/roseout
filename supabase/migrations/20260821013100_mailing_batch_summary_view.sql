create or replace view public.mailing_batch_summary
with (security_invoker = true)
as
select
  b.id,
  b.name,
  b.status,
  b.planned_mail_date,
  b.mailed_at,
  b.completed_at,
  b.notes,
  b.created_by,
  b.created_at,
  b.updated_at,
  count(i.id)::bigint as item_count,
  count(i.id) filter (where i.printed_at is not null)::bigint as printed_count,
  count(i.id) filter (where i.mailed_at is not null)::bigint as mailed_count,
  count(i.id) filter (where i.first_scan_at is not null)::bigint as scanned_count,
  count(i.id) filter (where i.claim_started_at is not null)::bigint as claim_started_count,
  count(i.id) filter (where i.claimed_at is not null)::bigint as claimed_count,
  count(i.id) filter (where i.returned_at is not null)::bigint as returned_count
from public.mailing_batches b
left join public.mailing_batch_items i on i.batch_id = b.id
group by b.id;

grant select on public.mailing_batch_summary to authenticated;
