-- POS evidence foundation for operational shards. No new payment authorization logic.
-- Signature payloads MUST be stored separately in encrypted, private object storage.
-- This metadata table contains only identifiers, hashes and retention controls.
begin;

create table if not exists public.pos_transaction_evidence (
  id uuid primary key default gen_random_uuid(),
  location_id uuid not null references public.locations(id) on delete cascade,
  check_id uuid not null references public.pos_checks(id) on delete cascade,
  tender_id uuid not null references public.pos_tenders(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('customer_signature','itemized_receipt','service_completion','booking_confirmation','customer_communication')),
  storage_key text not null,
  sha256_hex text not null check (sha256_hex ~ '^[a-f0-9]{64}$'),
  content_type text not null check (content_type in ('image/png','image/svg+xml','application/pdf','application/json','text/plain')),
  capture_source text not null check (capture_source in ('customer_display','certified_reader','system','manager_upload')),
  signed_at timestamptz null,
  captured_at timestamptz not null default now(),
  retention_until timestamptz null,
  metadata jsonb not null default '{}'::jsonb,
  constraint pos_evidence_signature_requires_time check (evidence_type <> 'customer_signature' or signed_at is not null),
  constraint pos_evidence_storage_private check (storage_key like 'pos-evidence/%' and storage_key !~ '^https?://'),
  unique (location_id, tender_id, evidence_type, sha256_hex)
);
create index if not exists pos_transaction_evidence_lookup
  on public.pos_transaction_evidence (location_id, tender_id, captured_at desc);
alter table public.pos_transaction_evidence enable row level security;
revoke all on table public.pos_transaction_evidence from public, anon, authenticated;
grant select, insert on table public.pos_transaction_evidence to service_role;

-- Immutable evidence: server-side app should not update/delete records.
-- Retention purge requires a separate audited, service-controlled job.
create or replace function public.pos_transaction_evidence_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'pos_transaction_evidence_immutable';
end $$;
drop trigger if exists pos_transaction_evidence_block_mutation on public.pos_transaction_evidence;
create trigger pos_transaction_evidence_block_mutation
  before update or delete on public.pos_transaction_evidence
  for each row execute function public.pos_transaction_evidence_immutable();

commit;
