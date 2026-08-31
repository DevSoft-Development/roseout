create table if not exists public.support_groups (
  id uuid primary key default gen_random_uuid(), key text not null unique, name text not null, description text,
  active boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.support_sla_policies (
  id uuid primary key default gen_random_uuid(), priority text not null unique check (priority in ('low','normal','high','urgent')),
  first_response_minutes integer not null check (first_response_minutes > 0), resolution_minutes integer not null check (resolution_minutes > 0),
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.support_business_hours (
  id uuid primary key default gen_random_uuid(), day_of_week integer not null unique check (day_of_week between 0 and 6),
  start_time time not null default '09:00', end_time time not null default '17:00', timezone text not null default 'America/New_York',
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint support_business_hours_range_check check (end_time > start_time)
);

create table if not exists public.support_macros (
  id uuid primary key default gen_random_uuid(), key text not null unique, name text not null, body text, set_status text, set_priority text,
  assigned_group text, tags text[] not null default '{}', active boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint support_macros_status_check check (set_status is null or set_status in ('new','open','pending','waiting_on_customer','waiting_on_internal','escalated','resolved','closed','reopened')),
  constraint support_macros_priority_check check (set_priority is null or set_priority in ('low','normal','high','urgent'))
);

create table if not exists public.support_triggers (
  id uuid primary key default gen_random_uuid(), key text not null unique, name text not null, category_contains text, source_contains text,
  requester_type text, require_location boolean, target_group text, set_priority text, add_tags text[] not null default '{}',
  active boolean not null default true, sort_order integer not null default 100,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint support_triggers_priority_check check (set_priority is null or set_priority in ('low','normal','high','urgent'))
);

create table if not exists public.support_automation_rules (
  id uuid primary key default gen_random_uuid(), key text not null unique, name text not null,
  rule_type text not null check (rule_type in ('auto_close_resolved','waiting_reminder')),
  minutes_after integer not null check (minutes_after > 0), enabled boolean not null default true, config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

alter table public.support_groups enable row level security;
alter table public.support_sla_policies enable row level security;
alter table public.support_business_hours enable row level security;
alter table public.support_macros enable row level security;
alter table public.support_triggers enable row level security;
alter table public.support_automation_rules enable row level security;

revoke all on public.support_groups from anon, authenticated;
revoke all on public.support_sla_policies from anon, authenticated;
revoke all on public.support_business_hours from anon, authenticated;
revoke all on public.support_macros from anon, authenticated;
revoke all on public.support_triggers from anon, authenticated;
revoke all on public.support_automation_rules from anon, authenticated;

grant select, insert, update, delete on public.support_groups to service_role;
grant select, insert, update, delete on public.support_sla_policies to service_role;
grant select, insert, update, delete on public.support_business_hours to service_role;
grant select, insert, update, delete on public.support_macros to service_role;
grant select, insert, update, delete on public.support_triggers to service_role;
grant select, insert, update, delete on public.support_automation_rules to service_role;

insert into public.support_groups (key,name,description,sort_order) values
 ('customer_support','Customer Support','General customer support queue',10),
 ('location_success','Location Success','Support for claimed and partner locations',20),
 ('billing','Billing','Billing, payment, subscription, and invoice issues',30),
 ('reservations','Reservations','Reservation and booking support',40),
 ('technical_support','Technical Support','Website, domain, bug, and technical issues',50)
on conflict (key) do update set name=excluded.name,description=excluded.description,sort_order=excluded.sort_order;

insert into public.support_sla_policies (priority,first_response_minutes,resolution_minutes) values
 ('urgent',15,240),('high',60,720),('normal',240,1440),('low',480,4320)
on conflict (priority) do nothing;

insert into public.support_business_hours (day_of_week,start_time,end_time,timezone,active) values
 (0,'09:00','17:00','America/New_York',false),
 (1,'09:00','17:00','America/New_York',true),(2,'09:00','17:00','America/New_York',true),
 (3,'09:00','17:00','America/New_York',true),(4,'09:00','17:00','America/New_York',true),
 (5,'09:00','17:00','America/New_York',true),(6,'09:00','17:00','America/New_York',false)
on conflict (day_of_week) do nothing;

insert into public.support_triggers (key,name,category_contains,target_group,sort_order) values
 ('billing','Billing tickets','billing','billing',10),('reservations','Reservation tickets','reservation','reservations',20),
 ('technical','Technical tickets','technical','technical_support',30),('website','Website tickets','website','technical_support',40),
 ('domain','Domain tickets','domain','technical_support',50),('bug','Bug reports','bug','technical_support',60)
on conflict (key) do nothing;
insert into public.support_triggers (key,name,require_location,target_group,sort_order) values
 ('location_account','Location account tickets',true,'location_success',90)
on conflict (key) do nothing;

insert into public.support_macros (key,name,body,set_status,sort_order) values
 ('request_more_information','Request more information','Thanks for contacting TheOutHaven. Please send the additional details requested so we can continue working on this for you.','waiting_on_customer',10),
 ('billing_follow_up','Billing follow-up','We are reviewing the billing details on your account and will follow up as soon as the review is complete.','waiting_on_internal',20),
 ('technical_troubleshooting','Technical troubleshooting','We are reviewing the technical issue now. If possible, please include the exact page, device, and steps that produced the issue.','waiting_on_customer',30),
 ('resolved','Resolution confirmation','Your request has been resolved. If the issue returns, reply here and we can reopen the case.','resolved',40)
on conflict (key) do nothing;

insert into public.support_automation_rules (key,name,rule_type,minutes_after,config) values
 ('resolved_auto_close','Auto-close resolved tickets','auto_close_resolved',7200,'{}'::jsonb),
 ('waiting_customer_reminder','Waiting on customer reminder','waiting_reminder',2880,'{"status":"waiting_on_customer"}'::jsonb)
on conflict (key) do nothing;

create index if not exists support_tickets_group_status_idx on public.support_tickets (assigned_group,status,updated_at desc);
create index if not exists support_tickets_priority_status_idx on public.support_tickets (priority,status,updated_at desc);
create index if not exists support_tickets_tags_gin_idx on public.support_tickets using gin (tags);
