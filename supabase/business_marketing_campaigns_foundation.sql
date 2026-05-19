create table if not exists public.business_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  location_id uuid references public.locations(id) on delete cascade,
  campaign_type text,
  title text,
  message text,
  status text default 'draft',
  channel text,
  created_by uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists business_marketing_campaigns_location_idx
  on public.business_marketing_campaigns(location_id, status);
