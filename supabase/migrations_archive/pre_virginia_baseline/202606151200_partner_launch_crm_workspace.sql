-- Partner Launch CRM/workspace fields. Safe, additive migration.
alter table public.locations add column if not exists sales_campaign text;
alter table public.locations add column if not exists sales_campaign_stage text;
alter table public.locations add column if not exists partner_launch_selected boolean default false;
alter table public.locations add column if not exists partner_launch_pilot boolean default false;
alter table public.locations add column if not exists launch_partner_position integer;
alter table public.locations add column if not exists claim_outreach_status text default 'not_sent';
alter table public.locations add column if not exists claim_outreach_channel text;
alter table public.locations add column if not exists claim_sent_at timestamptz;
alter table public.locations add column if not exists claim_viewed_at timestamptz;
alter table public.locations add column if not exists claim_started_at timestamptz;
alter table public.locations add column if not exists claim_submitted_at timestamptz;
alter table public.locations add column if not exists claim_approved_at timestamptz;
alter table public.locations add column if not exists claim_last_follow_up_at timestamptz;
alter table public.locations add column if not exists claim_outreach_notes text;
alter table public.locations add column if not exists partner_sales_status text default 'target';
alter table public.locations add column if not exists next_action text;
alter table public.locations add column if not exists next_action_type text;
alter table public.locations add column if not exists next_action_due_at timestamptz;
alter table public.locations add column if not exists payment_link_sent_at timestamptz;
alter table public.locations add column if not exists demo_scheduled_at timestamptz;
alter table public.locations add column if not exists demo_completed_at timestamptz;
alter table public.locations add column if not exists owner_objection text;
alter table public.locations add column if not exists lost_reason text;
alter table public.locations add column if not exists sales_notes text;
alter table public.locations add column if not exists partner_plan_name text default 'TheOutHaven Partner';
alter table public.locations add column if not exists partner_plan_price_cents integer default 9900;
alter table public.locations add column if not exists partner_activated_at timestamptz;
alter table public.locations add column if not exists partner_canceled_at timestamptz;
alter table public.locations add column if not exists reservation_portal_status text default 'not_enabled';
alter table public.locations add column if not exists reservation_portal_enabled_at timestamptz;
alter table public.locations add column if not exists reservation_portal_tested_at timestamptz;
alter table public.locations add column if not exists reservation_portal_notes text;
alter table public.locations add column if not exists reservation_portal_url text;
alter table public.locations add column if not exists reservation_embed_status text default 'not_sent';
alter table public.locations add column if not exists reservation_embed_code_generated_at timestamptz;
alter table public.locations add column if not exists reservation_embed_sent_at timestamptz;
alter table public.locations add column if not exists reservation_embed_installed_at timestamptz;
alter table public.locations add column if not exists reservation_embed_tested_at timestamptz;
alter table public.locations add column if not exists reservation_embed_install_url text;
alter table public.locations add column if not exists reservation_embed_notes text;
alter table public.locations add column if not exists discovery_profile_status text default 'needs_review';
alter table public.locations add column if not exists discovery_profile_ready_at timestamptz;
alter table public.locations add column if not exists discovery_profile_notes text;
alter table public.locations add column if not exists partner_setup_checklist jsonb default '{}'::jsonb;
alter table public.locations add column if not exists partner_setup_score integer default 0;
alter table public.locations add column if not exists reservation_portal_readiness_score integer default 0;
alter table public.locations add column if not exists embed_readiness_score integer default 0;
alter table public.locations add column if not exists discovery_readiness_score integer default 0;
alter table public.locations add column if not exists sales_readiness_score integer default 0;
alter table public.locations add column if not exists owner_contact_missing boolean default false;
alter table public.locations add column if not exists owner_instagram text;
alter table public.locations add column if not exists webmaster_email text;
alter table public.locations add column if not exists webmaster_phone text;

create index if not exists idx_locations_sales_campaign on public.locations(sales_campaign);
create index if not exists idx_locations_partner_launch_selected on public.locations(partner_launch_selected);
create index if not exists idx_locations_partner_launch_pilot on public.locations(partner_launch_pilot);
create index if not exists idx_locations_claim_outreach_status on public.locations(claim_outreach_status);
create index if not exists idx_locations_partner_sales_status on public.locations(partner_sales_status);
create index if not exists idx_locations_next_action_due_at on public.locations(next_action_due_at);
create index if not exists idx_locations_reservation_portal_status on public.locations(reservation_portal_status);
create index if not exists idx_locations_reservation_embed_status on public.locations(reservation_embed_status);
create index if not exists idx_locations_discovery_profile_status on public.locations(discovery_profile_status);
create index if not exists idx_locations_plan_status on public.locations(plan_status);
create index if not exists idx_locations_partner_activated_at on public.locations(partner_activated_at);

update public.locations
set partner_plan_name = 'TheOutHaven Partner', partner_plan_price_cents = 9900
where coalesce(plan,'') in ('pro','reserve','pro_reserve','partner_99')
   or coalesce(subscription_plan,'') in ('pro','reserve','pro_reserve','partner_99')
   or coalesce(is_pro,false) = true
   or coalesce(plan_status,'') = 'active';

update public.locations set claim_outreach_status = 'not_sent'
where claim_outreach_status is null and (claim_url is not null or claim_code is not null);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='locations' AND column_name='reservation_embed_enabled') THEN
    EXECUTE 'update public.locations set reservation_embed_status = ''generated'' where reservation_embed_status in (''not_sent'', '''') and reservation_embed_enabled = true';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='locations' AND column_name='reservation_enabled') THEN
    EXECUTE 'update public.locations set reservation_portal_status = ''enabled'' where reservation_portal_status in (''not_enabled'', '''') and reservation_enabled = true';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='locations' AND column_name='internal_reservations_enabled') THEN
    EXECUTE 'update public.locations set reservation_portal_status = ''enabled'' where reservation_portal_status in (''not_enabled'', '''') and internal_reservations_enabled = true';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='locations' AND column_name='uses_internal_reservations') THEN
    EXECUTE 'update public.locations set reservation_portal_status = ''enabled'' where reservation_portal_status in (''not_enabled'', '''') and uses_internal_reservations = true';
  END IF;
END $$;

-- Existing views that select l.* automatically expose these columns. No drop/recreate is needed here.
