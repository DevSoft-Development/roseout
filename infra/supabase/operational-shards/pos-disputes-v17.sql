-- POS dispute case management (schema only; not deployed).
-- No payment activation, submission privileges, or write-routing changes.
begin;
create table if not exists public.pos_dispute_cases (
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references public.locations(id) on delete cascade,
 tender_id uuid not null references public.pos_tenders(id) on delete cascade,
 provider text not null check (provider in ('stripe')),
 provider_dispute_id text not null,
 provider_payment_intent_id text not null,
 connected_account_id text not null,
 amount_cents integer not null check (amount_cents>0),
 currency text not null check (currency ~ '^[a-z]{3}$'),
 reason text not null,
 status text not null,
 evidence_due_at timestamptz,
 submitted_at timestamptz,
 resolved_at timestamptz,
 provider_event_id text not null,
 metadata jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique (provider,connected_account_id,provider_dispute_id),
 unique (location_id,provider_event_id)
);
create index if not exists pos_dispute_cases_deadline_idx
 on public.pos_dispute_cases(location_id,evidence_due_at) where submitted_at is null;
create table if not exists public.pos_dispute_review_events (
 id uuid primary key default gen_random_uuid(),
 location_id uuid not null references public.locations(id) on delete cascade,
 dispute_id uuid not null references public.pos_dispute_cases(id) on delete cascade,
 actor_user_id uuid not null,
 action text not null check(action in ('view','prepare','approve','reject','submit','note')),
 evidence_sha256 text,
 created_at timestamptz not null default now()
);
alter table public.pos_dispute_cases enable row level security;
alter table public.pos_dispute_review_events enable row level security;
revoke all on public.pos_dispute_cases, public.pos_dispute_review_events from public,anon,authenticated;
grant select,insert,update on public.pos_dispute_cases to service_role;
grant select,insert on public.pos_dispute_review_events to service_role;
create or replace function public.pos_dispute_review_immutable()
returns trigger language plpgsql set search_path=public as $$
begin raise exception 'pos_dispute_review_immutable'; end $$;
drop trigger if exists pos_dispute_review_block_mutation on public.pos_dispute_review_events;
create trigger pos_dispute_review_block_mutation before update or delete on public.pos_dispute_review_events
 for each row execute function public.pos_dispute_review_immutable();
commit;
