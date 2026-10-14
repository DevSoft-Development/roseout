-- Operational shard v13 - private evidence bucket and evidence access audit.
-- Apply only after v11 evidence migration, with shard/DR parity verified.
begin;

-- Supabase private storage bucket: object policies remain deny-by-default.
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('pos-transaction-evidence','pos-transaction-evidence',false,1048576,array['image/png','application/pdf','application/json','text/plain'])
on conflict (id) do update
set public=false,file_size_limit=1048576,
    allowed_mime_types=array['image/png','application/pdf','application/json','text/plain'];

create table if not exists public.pos_evidence_access_events (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  tender_id uuid not null references public.pos_tenders(id) on delete cascade,
  evidence_id uuid null references public.pos_transaction_evidence(id) on delete set null,
  actor_user_id uuid not null,
  action text not null check (action in ('list','view','download','export_packet','capture')),
  result text not null check (result in ('allowed','denied','error')),
  request_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists pos_evidence_access_events_location_time
on public.pos_evidence_access_events(location_id,created_at desc);
alter table public.pos_evidence_access_events enable row level security;
revoke all on public.pos_evidence_access_events from public,anon,authenticated;
grant select,insert on public.pos_evidence_access_events to service_role;

create or replace function public.pos_evidence_access_immutable()
returns trigger language plpgsql as $$
begin raise exception 'pos_evidence_access_immutable'; end $$;
drop trigger if exists pos_evidence_access_block_mutation on public.pos_evidence_access_events;
create trigger pos_evidence_access_block_mutation before update or delete
  on public.pos_evidence_access_events for each row
  execute function public.pos_evidence_access_immutable();

commit;
