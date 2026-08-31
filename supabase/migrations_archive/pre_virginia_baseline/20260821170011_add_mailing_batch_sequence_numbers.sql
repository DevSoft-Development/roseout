alter table public.mailing_batch_items add column if not exists sequence_number integer;

with ranked as (
  select id, row_number() over (partition by batch_id order by created_at, id)::integer as seq
  from public.mailing_batch_items
)
update public.mailing_batch_items mbi
set sequence_number = ranked.seq
from ranked
where mbi.id = ranked.id
  and mbi.sequence_number is null;

alter table public.mailing_batch_items alter column sequence_number set not null;

alter table public.mailing_batch_items
  drop constraint if exists mailing_batch_items_sequence_number_check;
alter table public.mailing_batch_items
  add constraint mailing_batch_items_sequence_number_check check (sequence_number > 0);

create unique index if not exists mailing_batch_items_batch_sequence_uidx
  on public.mailing_batch_items(batch_id, sequence_number);
