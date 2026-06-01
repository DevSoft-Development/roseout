create extension if not exists pg_trgm;

create table if not exists public.knowledge_base_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  icon text,
  audience text not null default 'internal',
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_base_categories_audience_check check (audience in ('internal','public','both'))
);

create table if not exists public.knowledge_base_articles (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.knowledge_base_categories(id) on delete set null,
  title text not null,
  slug text not null,
  excerpt text,
  content text not null,
  search_text text generated always as (coalesce(title,'') || ' ' || coalesce(excerpt,'') || ' ' || coalesce(content,'')) stored,
  status text not null default 'draft',
  visibility text not null default 'internal',
  allowed_roles text[] not null default array['superadmin','admin','editor','viewer']::text[],
  article_type text not null default 'article',
  template_type text,
  tags text[] not null default '{}'::text[],
  is_featured boolean not null default false,
  ai_approved boolean not null default false,
  public_audience text[] not null default '{}'::text[],
  helpful_count int not null default 0,
  not_helpful_count int not null default 0,
  view_count int not null default 0,
  published_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint knowledge_base_articles_status_check check (status in ('draft','published','archived')),
  constraint knowledge_base_articles_visibility_check check (visibility in ('internal','public','both')),
  constraint knowledge_base_articles_article_type_check check (article_type in ('article','policy','guide','script','checklist','faq','template')),
  constraint knowledge_base_articles_slug_visibility_unique unique (slug, visibility)
);

create table if not exists public.knowledge_base_article_versions (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.knowledge_base_articles(id) on delete cascade,
  title text not null,
  excerpt text,
  content text not null,
  status text not null,
  visibility text not null,
  allowed_roles text[] not null default '{}'::text[],
  tags text[] not null default '{}'::text[],
  saved_by uuid,
  saved_at timestamptz not null default now()
);

create table if not exists public.knowledge_base_template_variables (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.knowledge_base_articles(id) on delete cascade,
  variable_key text not null,
  label text not null,
  placeholder text,
  is_required boolean not null default false,
  sort_order int not null default 0,
  constraint knowledge_base_template_variables_article_key_unique unique (article_id, variable_key)
);

create table if not exists public.knowledge_base_ai_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  question text not null,
  answer text,
  source_article_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'answered',
  created_at timestamptz not null default now(),
  constraint knowledge_base_ai_questions_status_check check (status in ('answered','no_answer','error'))
);

create table if not exists public.knowledge_base_feedback (
  id uuid primary key default gen_random_uuid(),
  article_id uuid references public.knowledge_base_articles(id) on delete cascade,
  user_id uuid,
  rating text not null,
  note text,
  created_at timestamptz not null default now(),
  constraint knowledge_base_feedback_rating_check check (rating in ('helpful','not_helpful'))
);

create index if not exists kb_categories_slug_idx on public.knowledge_base_categories(slug);
create index if not exists kb_articles_slug_idx on public.knowledge_base_articles(slug);
create index if not exists kb_articles_status_idx on public.knowledge_base_articles(status);
create index if not exists kb_articles_visibility_idx on public.knowledge_base_articles(visibility);
create index if not exists kb_articles_category_idx on public.knowledge_base_articles(category_id);
create index if not exists kb_articles_type_idx on public.knowledge_base_articles(article_type);
create index if not exists kb_articles_template_type_idx on public.knowledge_base_articles(template_type);
create index if not exists kb_articles_tags_gin_idx on public.knowledge_base_articles using gin(tags);
create index if not exists kb_articles_allowed_roles_gin_idx on public.knowledge_base_articles using gin(allowed_roles);
create index if not exists kb_articles_public_audience_gin_idx on public.knowledge_base_articles using gin(public_audience);
create index if not exists kb_articles_search_gin_idx on public.knowledge_base_articles using gin(to_tsvector('english', search_text));
create index if not exists kb_articles_title_trgm_idx on public.knowledge_base_articles using gin(title gin_trgm_ops);
create index if not exists kb_articles_created_at_desc_idx on public.knowledge_base_articles(created_at desc);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_kb_categories_updated_at on public.knowledge_base_categories;
create trigger set_kb_categories_updated_at before update on public.knowledge_base_categories for each row execute function public.set_updated_at();
drop trigger if exists set_kb_articles_updated_at on public.knowledge_base_articles;
create trigger set_kb_articles_updated_at before update on public.knowledge_base_articles for each row execute function public.set_updated_at();

create or replace function public.kb_current_admin_role()
returns text language sql stable security definer set search_path = public as $$
  select lower(role) from public.admin_users where user_id = auth.uid() limit 1;
$$;

create or replace function public.kb_normalized_role(role text)
returns text language sql immutable as $$
  select case lower(coalesce(role,''))
    when 'ambassador' then 'partner_ambassador'
    when 'ambassador_team' then 'partner_ambassador'
    when 'experience' then 'experience_team'
    else lower(coalesce(role,''))
  end;
$$;

create or replace function public.kb_is_admin_manager()
returns boolean language sql stable security definer set search_path = public as $$
  select public.kb_normalized_role(public.kb_current_admin_role()) in ('superadmin','admin');
$$;

create or replace function public.kb_can_view_internal_article(article_allowed_roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select public.kb_is_admin_manager()
    or public.kb_normalized_role(public.kb_current_admin_role()) = any(select public.kb_normalized_role(unnest(coalesce(article_allowed_roles, '{}'))));
$$;

alter table public.knowledge_base_categories enable row level security;
alter table public.knowledge_base_articles enable row level security;
alter table public.knowledge_base_article_versions enable row level security;
alter table public.knowledge_base_template_variables enable row level security;
alter table public.knowledge_base_ai_questions enable row level security;
alter table public.knowledge_base_feedback enable row level security;

drop policy if exists "KB categories public select active" on public.knowledge_base_categories;
create policy "KB categories public select active" on public.knowledge_base_categories for select using (is_active = true and audience in ('public','both'));
drop policy if exists "KB categories internal select" on public.knowledge_base_categories;
create policy "KB categories internal select" on public.knowledge_base_categories for select to authenticated using (is_active = true or public.kb_is_admin_manager());
drop policy if exists "KB categories managers write" on public.knowledge_base_categories;
create policy "KB categories managers write" on public.knowledge_base_categories for all to authenticated using (public.kb_is_admin_manager()) with check (public.kb_is_admin_manager());

drop policy if exists "KB public can select published public articles" on public.knowledge_base_articles;
create policy "KB public can select published public articles" on public.knowledge_base_articles for select using (status = 'published' and visibility in ('public','both'));
drop policy if exists "KB internal can select allowed published articles" on public.knowledge_base_articles;
create policy "KB internal can select allowed published articles" on public.knowledge_base_articles for select to authenticated using ((status = 'published' and visibility in ('internal','both') and public.kb_can_view_internal_article(allowed_roles)) or public.kb_is_admin_manager() or (public.kb_normalized_role(public.kb_current_admin_role()) = 'editor' and created_by = auth.uid()));
drop policy if exists "KB managers write articles" on public.knowledge_base_articles;
create policy "KB managers write articles" on public.knowledge_base_articles for all to authenticated using (public.kb_is_admin_manager()) with check (public.kb_is_admin_manager());
drop policy if exists "KB editors insert drafts" on public.knowledge_base_articles;
create policy "KB editors insert drafts" on public.knowledge_base_articles for insert to authenticated with check (public.kb_normalized_role(public.kb_current_admin_role()) = 'editor' and status = 'draft' and created_by = auth.uid());
drop policy if exists "KB editors update own drafts" on public.knowledge_base_articles;
create policy "KB editors update own drafts" on public.knowledge_base_articles for update to authenticated using (public.kb_normalized_role(public.kb_current_admin_role()) = 'editor' and created_by = auth.uid() and status = 'draft') with check (public.kb_normalized_role(public.kb_current_admin_role()) = 'editor' and created_by = auth.uid() and status = 'draft');

drop policy if exists "KB versions managers and editors" on public.knowledge_base_article_versions;
create policy "KB versions managers and editors" on public.knowledge_base_article_versions for all to authenticated using (public.kb_is_admin_manager() or public.kb_normalized_role(public.kb_current_admin_role()) = 'editor') with check (public.kb_is_admin_manager() or public.kb_normalized_role(public.kb_current_admin_role()) = 'editor');
drop policy if exists "KB template variables public select" on public.knowledge_base_template_variables;
create policy "KB template variables public select" on public.knowledge_base_template_variables for select using (exists (select 1 from public.knowledge_base_articles a where a.id = article_id and a.status='published' and a.visibility in ('public','both')));
drop policy if exists "KB template variables internal select" on public.knowledge_base_template_variables;
create policy "KB template variables internal select" on public.knowledge_base_template_variables for select to authenticated using (exists (select 1 from public.knowledge_base_articles a where a.id = article_id and (public.kb_is_admin_manager() or public.kb_can_view_internal_article(a.allowed_roles))));
drop policy if exists "KB template variables managers write" on public.knowledge_base_template_variables;
create policy "KB template variables managers write" on public.knowledge_base_template_variables for all to authenticated using (public.kb_is_admin_manager()) with check (public.kb_is_admin_manager());

drop policy if exists "KB feedback insert authenticated" on public.knowledge_base_feedback;
create policy "KB feedback insert authenticated" on public.knowledge_base_feedback for insert to authenticated with check (auth.uid() = user_id or user_id is null);
drop policy if exists "KB feedback insert anon" on public.knowledge_base_feedback;
create policy "KB feedback insert anon" on public.knowledge_base_feedback for insert to anon with check (true);
drop policy if exists "KB feedback managers select" on public.knowledge_base_feedback;
create policy "KB feedback managers select" on public.knowledge_base_feedback for select to authenticated using (public.kb_is_admin_manager());
drop policy if exists "KB ai history managers select" on public.knowledge_base_ai_questions;
create policy "KB ai history managers select" on public.knowledge_base_ai_questions for select to authenticated using (public.kb_is_admin_manager());
drop policy if exists "KB ai history authenticated insert" on public.knowledge_base_ai_questions;
create policy "KB ai history authenticated insert" on public.knowledge_base_ai_questions for insert to authenticated with check (auth.uid() = user_id or user_id is null);

insert into public.knowledge_base_categories (name, slug, description, icon, audience, sort_order)
values
 ('Ambassador Hub','ambassador-hub','Partner Ambassador scripts, policies, and field guidance.','Users','internal',10),
 ('Sales + Partnerships','sales-partnerships','Sales scripts, objection responses, and partnership playbooks.','MessageSquare','internal',20),
 ('Location Onboarding','location-onboarding','Claim, onboarding, and Pro activation guidance.','ListChecks','internal',30),
 ('Support Team','support-team','Escalation rules and support reply patterns.','ShieldCheck','internal',40),
 ('Admin Operations','admin-operations','Internal admin process definitions and operating guidance.','Lock','internal',50),
 ('Reservations','reservations','Reservation guidance for internal teams and public users.','BookOpen','both',60),
 ('Billing + Plans','billing-plans','Plan and billing help for owners and internal teams.','FileText','both',70),
 ('Public Help Center','public-help-center','Public help articles for guests and location owners.','Globe','public',80)
on conflict (slug) do update set name = excluded.name, description = excluded.description, icon = excluded.icon, audience = excluded.audience, sort_order = excluded.sort_order;

with cats as (select slug, id from public.knowledge_base_categories), seed as (
  select 'Partner Ambassador Commission Rules' title,'partner-ambassador-commission-rules' slug,'How Partner Ambassadors earn and explain Pro Plan commissions.' excerpt,
  'Partner Ambassadors can earn a $75 one-time commission when a location upgrades to the $99/month Pro Plan and remains active for 45 active days. A commission is not earned if there is a refund, cancellation, chargeback, duplicate account, or fraud concern. Never promise guaranteed earnings, guaranteed placement, or instant payouts. Approved commissions are paid on the next scheduled payout cycle after eligibility is confirmed.' content,'published' status,'internal' visibility,array['superadmin','admin','editor','partner_ambassador']::text[] roles,'policy' article_type,'ambassador_script' template_type,array['ambassador','commission','pro']::text[] tags,true featured,true ai,'ambassador-hub' cat, '{}'::text[] aud
  union all select 'Pro Plan Sales Script','pro-plan-sales-script','A practical script for explaining TheOutHaven Pro to locations.','Intro: “Hi {{owner_name}}, I’m {{ambassador_name}} with TheOutHaven. We help guests discover and plan outings at places like {{location_name}}.”\n\nDiscovery questions:\n- How are people currently discovering you?\n- Do you want more visibility from people planning nights out?\n- Where do you send guests for reservations or next steps?\n\nValue pitch: The $99/month Pro Plan gives upgraded profile visibility, stronger owner controls, claim support, and better ways to guide guests to your booking or reservation links.\n\nClose: “Would you like me to send your claim link so you can review the Pro upgrade?”\n\nFollow-up: confirm the claim link, answer questions from approved materials, and document the next step in CRM.','published','internal',array['superadmin','admin','editor','partner_ambassador'],'script','sales_script',array['sales','pro','partnerships'],true,true,'sales-partnerships','{}'
  union all select 'Ambassador Do-Not-Say List','ambassador-do-not-say-list','Promises and claims Ambassadors should avoid.','Do not promise guaranteed revenue, guaranteed placement, exclusive category ownership, legal advice, tax advice, instant payouts, or that TheOutHaven replaces a location’s website or social channels. Use approved scripts and escalate unusual questions to an admin manager.','published','internal',array['superadmin','admin','editor','partner_ambassador'],'policy','ambassador_script',array['ambassador','compliance'],false,true,'ambassador-hub','{}'
  union all select 'CRM Lead Status Definitions','crm-lead-status-definitions','Definitions for core CRM lead stages.','New means no verified outreach has happened yet. Contacted means an approved touchpoint was made. Interested means the owner requested more information. Claim Sent means a claim link or claim code was provided. Pro Converted means the owner activated Pro. Not a Fit means the location should not be pursued right now.','published','internal',array['superadmin','admin','editor','partner_ambassador','experience_team'],'guide',null,array['crm','leads'],false,true,'admin-operations','{}'
  union all select 'Location Claim Code Process','location-claim-code-process','How to support claim code and claim link issues.','Confirm the business name, owner identity, and claimed location. If a claim code fails, verify spelling, expiration, duplicate submissions, and whether the location has already been claimed. Experience Team should escalate suspected fraud, ownership disputes, and repeated code failures to admin managers.','published','internal',array['superadmin','admin','editor','experience_team','partner_ambassador'],'guide',null,array['claims','owners'],false,true,'location-onboarding','{}'
  union all select 'How Locations Upgrade to Pro','how-locations-upgrade-to-pro','Internal overview of the Pro upgrade path.','Locations claim their profile, verify ownership, review Pro Plan benefits, confirm billing, and activate the $99/month plan. Support should not enter payment details for owners. Escalate billing errors, chargebacks, and duplicate upgrades.','published','internal',array['superadmin','admin','editor','experience_team','partner_ambassador'],'guide',null,array['pro','billing','owners'],false,true,'billing-plans','{}'
  union all select 'Support Escalation Rules','support-escalation-rules','When the Experience Team should escalate support issues.','Escalate safety concerns, legal threats, billing disputes, suspected fraud, ownership conflicts, reservation failures affecting multiple guests, privacy requests, and any issue outside approved support replies. Include user email, location, timeline, screenshots when available, and the requested outcome.','published','internal',array['superadmin','admin','editor','experience_team'],'policy','support_reply',array['support','escalation'],true,true,'support-team','{}'
  union all select 'Public FAQ: How TheOutHaven Works','how-theouthaven-works','Learn how guests use TheOutHaven to discover and plan outings.','TheOutHaven helps guests discover places to go, compare options, and plan outings with less friction. Browse locations, review details, and use available links to contact, book, reserve, or learn more from the business.','published','public',array['superadmin','admin','editor','viewer'],'faq','user_help',array['public','guests'],true,false,'public-help-center',array['user','visitor']::text[]
  union all select 'Public FAQ: How Businesses Claim Their Profile','how-businesses-claim-their-profile','How location owners can start a business claim.','Business owners can claim their profile by starting a claim, verifying ownership, and following the provided claim link or claim code process. If you need help, contact support with your business name, address, and owner contact details.','published','public',array['superadmin','admin','editor','viewer'],'faq','location_owner_guide',array['public','claims','owners'],true,false,'public-help-center',array['location_owner']::text[]
  union all select 'Public FAQ: Contacting Support','contacting-support','How guests and owners can contact TheOutHaven support.','If you need more help, contact TheOutHaven support with your name, email, location or reservation details if relevant, and a short summary of the issue. Owners should include the business name and address.','published','public',array['superadmin','admin','editor','viewer'],'faq','support_reply',array['public','support'],false,false,'public-help-center',array['user','location_owner','visitor']::text[]
  union all select 'Ambassador Follow-Up SMS','ambassador-follow-up-sms','Short SMS follow-up after a claim conversation.','Hi {{owner_name}}, this is {{ambassador_name}} with TheOutHaven. I’m following up about {{location_name}} and your profile claim. Here’s the link: {{claim_link}}.','published','internal',array['superadmin','admin','editor','partner_ambassador'],'template','sms',array['sms','ambassador','claim'],false,true,'ambassador-hub','{}'
  union all select 'Location Claim Follow-Up Email','location-claim-follow-up-email','Email template for owner claim follow-up.','Subject: Your TheOutHaven profile claim for {{location_name}}\n\nHi {{owner_name}},\n\nThis is {{ambassador_name}} with TheOutHaven. I’m following up on your profile claim for {{location_name}}. You can continue here: {{claim_link}}\n\nOnce claimed, you can review your business details and explore Pro options.\n\nBest,\n{{ambassador_name}}','published','internal',array['superadmin','admin','editor','partner_ambassador'],'template','email',array['email','claim','owners'],false,true,'sales-partnerships','{}'
  union all select 'Objection Response: We Already Use Instagram','objection-response-we-already-use-instagram','Approved response to the Instagram objection.','That makes sense — TheOutHaven is not replacing Instagram. Instagram is great for followers who already know you. TheOutHaven helps people who are actively discovering and planning outings compare options and find the next step to visit, book, or contact you.','published','internal',array['superadmin','admin','editor','partner_ambassador'],'template','objection_response',array['objection','instagram','sales'],false,true,'sales-partnerships','{}'
  union all select 'New Pro Location Onboarding Checklist','new-pro-location-onboarding-checklist','Checklist for onboarding a new Pro location.','- Confirm business info\n- Verify owner\n- Upload photos\n- Confirm category\n- Add booking/reservation link\n- Explain Pro benefits\n- Confirm billing\n- Schedule 30-day check-in','published','internal',array['superadmin','admin','editor','experience_team'],'checklist','onboarding_checklist',array['onboarding','pro','checklist'],false,true,'location-onboarding','{}'
)
insert into public.knowledge_base_articles (title, slug, excerpt, content, status, visibility, allowed_roles, article_type, template_type, tags, is_featured, ai_approved, category_id, public_audience, published_at)
select seed.title, seed.slug, seed.excerpt, seed.content, seed.status, seed.visibility, seed.roles, seed.article_type, seed.template_type, seed.tags, seed.featured, seed.ai, cats.id, seed.aud, now()
from seed join cats on cats.slug = seed.cat
on conflict (slug, visibility) do update set title=excluded.title, excerpt=excluded.excerpt, content=excluded.content, status=excluded.status, allowed_roles=excluded.allowed_roles, article_type=excluded.article_type, template_type=excluded.template_type, tags=excluded.tags, is_featured=excluded.is_featured, ai_approved=excluded.ai_approved, category_id=excluded.category_id, public_audience=excluded.public_audience, published_at=coalesce(public.knowledge_base_articles.published_at, excluded.published_at);

with email_article as (select id from public.knowledge_base_articles where slug='location-claim-follow-up-email' and visibility='internal')
insert into public.knowledge_base_template_variables (article_id, variable_key, label, placeholder, is_required, sort_order)
select id, variable_key, label, placeholder, true, sort_order from email_article cross join (values
 ('owner_name','Owner name','Jordan',1),
 ('location_name','Location name','The Rose Room',2),
 ('claim_link','Claim link','https://theouthaven.com/business/claim',3),
 ('ambassador_name','Ambassador name','Taylor',4)
) as vars(variable_key,label,placeholder,sort_order)
on conflict (article_id, variable_key) do update set label=excluded.label, placeholder=excluded.placeholder, is_required=excluded.is_required, sort_order=excluded.sort_order;
