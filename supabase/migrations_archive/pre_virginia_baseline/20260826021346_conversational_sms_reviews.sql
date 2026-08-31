create table if not exists public.sms_review_conversations (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null,
  channel_number text not null default '+15162000411',
  outing_id uuid null references public.outings(id) on delete cascade,
  reservation_id uuid null references public.location_reservations(id) on delete cascade,
  user_id uuid null,
  status text not null default 'active' check (status in ('active','completed','cancelled','expired')),
  stage text not null check (stage in ('attendance','location_rating','location_text','platform_rating','platform_text','complete')),
  current_location_id uuid null references public.locations(id) on delete set null,
  location_queue uuid[] not null default '{}'::uuid[],
  context jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  last_inbound_at timestamptz null,
  last_outbound_at timestamptz null,
  completed_at timestamptz null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (((outing_id is not null)::int + (reservation_id is not null)::int) = 1)
);

alter table public.sms_review_conversations enable row level security;
revoke all on table public.sms_review_conversations from anon, authenticated;
grant all on table public.sms_review_conversations to service_role;

create unique index if not exists uniq_sms_review_active_phone
  on public.sms_review_conversations(phone_e164)
  where status = 'active';
create index if not exists idx_sms_review_outing on public.sms_review_conversations(outing_id) where outing_id is not null;
create index if not exists idx_sms_review_reservation on public.sms_review_conversations(reservation_id) where reservation_id is not null;
create index if not exists idx_sms_review_expiry on public.sms_review_conversations(status, expires_at);

drop index if exists public.uniq_review_eligibility_outing;
create unique index if not exists uniq_review_eligibility_outing_location
  on public.location_review_eligibility(outing_id, location_id)
  where outing_id is not null;

drop index if exists public.uniq_location_reviews_outing;
create unique index if not exists uniq_location_reviews_outing_location
  on public.location_reviews(outing_id, location_id)
  where outing_id is not null;
