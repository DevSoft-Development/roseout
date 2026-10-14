-- Draft operational-shard v12: gratuity configuration, not live charge calculation.
begin;
create table if not exists public.pos_gratuity_policies (
  location_id uuid primary key references public.locations(id) on delete cascade,
  venue_mode text not null default 'restaurant' check (venue_mode in ('restaurant','activity','hybrid')),
  suggestions_enabled boolean not null default true,
  tip_suggestions integer[] not null default array[15,18,20],
  auto_service_charge_enabled boolean not null default false,
  service_charge_percent_bps integer not null default 0 check (service_charge_percent_bps between 0 and 3000),
  party_size_threshold integer null check (party_size_threshold between 1 and 100),
  applies_to_food boolean not null default true,
  applies_to_activities boolean not null default false,
  extra_tip_prompt_with_service_charge boolean not null default false,
  customer_disclosure text null,
  updated_at timestamptz not null default now(),
  constraint gratuity_suggestions_valid check (
    array_length(tip_suggestions,1) between 1 and 5 and
    0 <= all(tip_suggestions)
  ),
  constraint gratuity_service_charge_rule check (
    not auto_service_charge_enabled or
    (service_charge_percent_bps > 0 and customer_disclosure is not null
     and length(trim(customer_disclosure)) >= 16 and
     (applies_to_food or applies_to_activities))
  )
);
alter table public.pos_gratuity_policies enable row level security;
revoke all on public.pos_gratuity_policies from public,anon,authenticated;
grant select,insert,update on public.pos_gratuity_policies to service_role;
commit;
