-- Canonical attribution spine: search -> touchpoint -> booking -> verified visit -> revenue.

alter table public.location_reservations
  add column if not exists attribution_search_id uuid,
  add column if not exists attribution_session_id text,
  add column if not exists attribution_anonymous_id text,
  add column if not exists attribution_result_impression_id text,
  add column if not exists attribution_promotion_campaign_id uuid references public.promotion_campaigns(id) on delete set null,
  add column if not exists attribution_promotion_event_id uuid references public.promotion_events(id) on delete set null,
  add column if not exists attribution_source_event_id uuid references public.analytics_events(id) on delete set null,
  add column if not exists attribution_channel_class text,
  add column if not exists attribution_context jsonb not null default '{}'::jsonb;

do $
begin
  if not exists (
    select 1 from pg_constraint
    where conname='location_reservations_attribution_channel_class_check'
      and conrelid='public.location_reservations'::regclass
  ) then
    alter table public.location_reservations
      add constraint location_reservations_attribution_channel_class_check
      check (attribution_channel_class is null or attribution_channel_class in ('organic','sponsored','owned','unknown'));
  end if;
end
$;

create index if not exists location_reservations_attribution_search_idx
  on public.location_reservations(attribution_search_id)
  where attribution_search_id is not null;
create index if not exists location_reservations_attribution_campaign_idx
  on public.location_reservations(attribution_promotion_campaign_id)
  where attribution_promotion_campaign_id is not null;
create index if not exists location_reservations_attribution_source_event_idx
  on public.location_reservations(attribution_source_event_id)
  where attribution_source_event_id is not null;

alter table public.marketing_attribution_events
  add column if not exists location_id uuid references public.locations(id) on delete set null,
  add column if not exists search_id uuid,
  add column if not exists search_event_row_id bigint references public.search_events(id) on delete set null,
  add column if not exists result_impression_id text,
  add column if not exists promotion_campaign_id uuid references public.promotion_campaigns(id) on delete set null,
  add column if not exists promotion_event_id uuid references public.promotion_events(id) on delete set null,
  add column if not exists reservation_id uuid references public.location_reservations(id) on delete set null,
  add column if not exists visit_id uuid references public.outing_visit_verifications(id) on delete set null,
  add column if not exists review_id uuid references public.location_reviews(id) on delete set null,
  add column if not exists experience_booking_id uuid references public.experience_bookings(id) on delete set null,
  add column if not exists event_ticket_order_id uuid references public.event_ticket_orders(id) on delete set null,
  add column if not exists channel_class text,
  add column if not exists attribution_model text,
  add column if not exists touchpoint_type text,
  add column if not exists conversion_id text,
  add column if not exists is_conversion boolean not null default false,
  add column if not exists revenue_cents bigint not null default 0,
  add column if not exists revenue_kind text not null default 'none',
  add column if not exists currency text not null default 'usd',
  add column if not exists dedupe_key text,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='marketing_attribution_channel_class_check'
      and conrelid='public.marketing_attribution_events'::regclass
  ) then
    alter table public.marketing_attribution_events
      add constraint marketing_attribution_channel_class_check
      check (channel_class is null or channel_class in ('organic','sponsored','owned','unknown'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname='marketing_attribution_revenue_kind_check'
      and conrelid='public.marketing_attribution_events'::regclass
  ) then
    alter table public.marketing_attribution_events
      add constraint marketing_attribution_revenue_kind_check
      check (revenue_kind in ('none','estimated','confirmed'));
  end if;
end
$$;

create unique index if not exists marketing_attribution_dedupe_key_idx
  on public.marketing_attribution_events(dedupe_key)
  where dedupe_key is not null;

create index if not exists marketing_attribution_location_time_idx
  on public.marketing_attribution_events(location_id, occurred_at desc);

create index if not exists marketing_attribution_reservation_idx
  on public.marketing_attribution_events(reservation_id)
  where reservation_id is not null;

create index if not exists marketing_attribution_visit_idx
  on public.marketing_attribution_events(visit_id)
  where visit_id is not null;

create index if not exists marketing_attribution_promotion_idx
  on public.marketing_attribution_events(promotion_campaign_id, occurred_at desc)
  where promotion_campaign_id is not null;

create index if not exists marketing_attribution_search_idx
  on public.marketing_attribution_events(search_id, occurred_at desc)
  where search_id is not null;

create index if not exists marketing_attribution_revenue_idx
  on public.marketing_attribution_events(location_id, revenue_kind, occurred_at desc)
  where revenue_cents > 0;

comment on table public.marketing_attribution_events is
  'Canonical attribution spine across organic/sponsored/owned touchpoints, bookings, verified visits, and revenue.';
comment on column public.marketing_attribution_events.channel_class is
  'Top-level attribution channel: organic, sponsored, owned, or unknown.';
comment on column public.marketing_attribution_events.revenue_kind is
  'none, estimated, or confirmed. Confirmed revenue must come from a payment/settlement source.';
