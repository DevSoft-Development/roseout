-- Idempotent TheOutHaven knowledge base content seed.

with seed_categories(name, slug, description, icon, audience, sort_order) as (
  values
    ('Ambassador Hub','ambassador-hub','Commission rules, compliance guardrails, and approved field guidance for Partner Ambassadors.','Users','internal',10),
    ('Sales + Partnerships','sales-partnerships','Approved sales scripts, partnership positioning, and follow-up language.','MessageSquare','internal',20),
    ('CRM + Lead Management','crm-lead-management','Lead pipeline definitions and CRM operating guidance.','Kanban','internal',30),
    ('Location Onboarding','location-onboarding','Profile setup, Pro onboarding, owner access, and launch quality checks.','ListChecks','internal',40),
    ('Claims + QR Codes','claims-qr-codes','Claim code, QR mailer, and owner verification processes.','QrCode','internal',50),
    ('Reservations','reservations','Reservation settings, embed guidance, and guest booking escalations.','CalendarCheck','both',60),
    ('Billing + Pro Plan','billing-pro-plan','Pro Plan pricing, billing, upgrades, cancellations, and plan messaging.','CreditCard','internal',70),
    ('Support + Experience Team','support-experience-team','Experience Team support workflows and escalation rules.','LifeBuoy','internal',80),
    ('Admin Operations','admin-operations','Imports, search quality, data quality, and platform operations.','Settings','internal',90),
    ('Public Help Center','public-help-center','Guest and location-owner help articles published to the public Help Center.','Globe','public',100)
)
insert into public.knowledge_base_categories (name, slug, description, icon, audience, sort_order, is_active, updated_at)
select name, slug, description, icon, audience, sort_order, true, now()
from seed_categories
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  audience = excluded.audience,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

with cats as (
  select id, slug from public.knowledge_base_categories
), seed_articles(title, slug, excerpt, content, status, visibility, roles, article_type, template_type, tags, featured, ai, cat_slug, audience) as (
  values
    ('Partner Ambassador Commission Rules','partner-ambassador-commission-rules','Rules for the one-time Partner Ambassador commission on approved Pro locations.',
$kb$Partner Ambassadors earn a one-time $75 commission for each approved Pro location.

A Pro location means a business that signs up for the $99/month Pro Plan.

Commission is earned only after the location remains active for 45 days.

No commission is earned for cancellation, refund, chargeback, duplicate account, fraudulent account, fake business, self-referral, or accounts already assigned to another Ambassador.

Approved commissions are paid on the next scheduled payout cycle after eligibility is confirmed.

Ambassadors must use approved scripts and accurate plan information.

Ambassadors cannot promise guaranteed traffic, guaranteed revenue, exclusive placement, or permanent discounts unless approved in writing.$kb$,
'published','internal',array['superadmin','admin','editor','viewer','partner_ambassador','experience_team']::text[],'policy',null,array['ambassador','commission','pro plan','sales']::text[],true,true,'ambassador-hub','{}'::text[]),

    ('TheOutHaven Pro Plan Overview','theouthaven-pro-plan-overview','Internal overview of the $99/month Pro Plan and approved plan positioning.',
$kb$The Pro Plan is $99/month.

The Pro Plan is for restaurants, lounges, activities, venues, and local businesses that want enhanced visibility and better business profile tools.

Explain current benefits in general terms without promising guaranteed bookings or revenue.

Use approved pricing only.

If pricing changes, staff must use the latest official plan details in the admin system.$kb$,
'published','internal',array['superadmin','admin','editor','viewer','partner_ambassador','experience_team']::text[],'guide',null,array['pro plan','billing','paid locations']::text[],false,true,'billing-pro-plan','{}'::text[]),

    ('Pro Plan Sales Script','pro-plan-sales-script','Approved Partner Ambassador script for introducing claims and the Pro Plan.',
$kb$Opening
“Hi, I’m {{ambassador_name}} with TheOutHaven. We help people discover restaurants, lounges, activities, and local experiences for outings, birthdays, celebrations, and group plans. I wanted to show you how {{location_name}} can claim its profile and upgrade to Pro for stronger visibility on the platform.”

Discovery Questions
- How are guests currently discovering {{location_name}}?
- Do you take reservations, booking requests, or event inquiries online?
- What kinds of outings, celebrations, or group plans are best for your business?
- Who should manage your public business profile and owner dashboard?

Value Pitch
TheOutHaven helps people discover restaurants, lounges, activities, and local experiences when they are planning where to go. Pro gives eligible businesses enhanced profile tools and stronger visibility without promising guaranteed traffic, bookings, or revenue.

Close
If you are ready, we can start by claiming your profile, confirming your business details, and reviewing the current Pro Plan details in the owner flow.

Follow-up
Send the claim link, confirm the best owner contact, and schedule a check-in after the profile has been reviewed.$kb$,
'published','internal',array['superadmin','admin','editor','viewer','partner_ambassador']::text[],'script','sales_script',array['sales','ambassador','script']::text[],true,true,'sales-partnerships','{}'::text[]),

    ('Ambassador Do-Not-Say List','ambassador-do-not-say-list','Compliance phrases Partner Ambassadors must avoid.',
$kb$Do not say:

- “We guarantee customers.”
- “You will definitely make your money back.”
- “You are required to pay to stay listed.”
- “This discount is permanent” unless approved.
- “We are partnered with Google, Yelp, Resy, Instagram, or OpenTable” unless officially approved.
- “You have exclusive placement” unless approved in writing.
- “I work as an employee of TheOutHaven” if the person is a contractor Ambassador.$kb$,
'published','internal',array['superadmin','admin','editor','viewer','partner_ambassador','experience_team']::text[],'policy',null,array['compliance','sales','ambassador']::text[],false,true,'ambassador-hub','{}'::text[]),

    ('CRM Lead Status Definitions','crm-lead-status-definitions','Definitions for TheOutHaven CRM lead and commission pipeline statuses.',
$kb$New Lead: A new business or location opportunity has been added and has not been contacted yet.

Contacted: Someone has reached out by phone, email, SMS, visit, or another approved channel.

Visited: A team member or Ambassador has visited or attempted an in-person conversation.

Interested: The business showed interest in claiming a profile, reviewing Pro, or continuing the conversation.

Follow Up Later: The business is not ready now, but asked for a future follow-up.

Not Interested: The business declined the opportunity for now.

Claim Started: The owner or team has started the business profile claim process.

Claimed Free Profile: The business profile has been claimed without a Pro Plan purchase.

Pro Plan Sold: The business signed up for the $99/month Pro Plan.

Active Under 45 Days: The Pro location is active but has not yet reached the 45-day commission eligibility window.

Commission Eligible: The Pro location remained active for 45 days and appears eligible for commission review.

Commission Paid: The approved commission was paid in a scheduled payout cycle.

Cancelled: The Pro Plan, claim, or account relationship was cancelled.

Disqualified: The lead or account is not eligible because of cancellation, refund, chargeback, duplicate account, fraud, fake business, self-referral, existing assignment, or another admin-approved reason.$kb$,
'published','internal',array['superadmin','admin','editor','viewer','experience_team','partner_ambassador']::text[],'guide',null,array['crm','pipeline','leads']::text[],true,true,'crm-lead-management','{}'::text[]),

    ('Claim Code and QR Mailer Process','claim-code-and-qr-mailer-process','How claim codes, QR codes, and mailers should work for location claims.',
$kb$Each location may receive a unique claim code and QR code.

QR code should lead to the claim flow for that location.

Printed mailers may include location name, address label, QR code, and unique claim code.

Ambassadors can follow up after mailers are sent.

QR links must use theouthaven.com, never roseout.com.

Duplicate or expired codes should be escalated to admin.$kb$,
'published','internal',array['superadmin','admin','editor','viewer','experience_team','partner_ambassador']::text[],'guide',null,array['qr code','claim code','mailer','location claim']::text[],true,true,'claims-qr-codes','{}'::text[]),

    ('Location Profile Onboarding Checklist','location-profile-onboarding-checklist','Checklist for onboarding locations and preparing strong business profiles.',
$kb$- Confirm business name
- Confirm address formatting
- Confirm phone and email
- Confirm website and booking/reservation link
- Confirm category and cuisine/activity type
- Upload quality photos
- Remove locations with no usable photos from live search unless approved
- Confirm owner access
- Explain Pro Plan benefits
- Schedule 30-day check-in$kb$,
'published','internal',array['superadmin','admin','editor','viewer','experience_team','partner_ambassador']::text[],'checklist','onboarding_checklist',array['onboarding','locations','pro plan']::text[],false,true,'location-onboarding','{}'::text[]),

    ('Reservation Embed and Owner Dashboard Guide','reservation-embed-and-owner-dashboard-guide','Reservation embed and owner dashboard guidance for Experience Team and admins.',
$kb$Locations should be able to view reservation settings in their dashboard.

Admin should be able to view, edit, and send embed code.

Reservation embed code lets locations add TheOutHaven reservation flow to their website.

Escalate broken embed codes, missing dashboards, and booking failures.$kb$,
'published','internal',array['superadmin','admin','editor','viewer','experience_team']::text[],'guide',null,array['reservations','embed','owner dashboard']::text[],false,true,'reservations','{}'::text[]),

    ('Support Escalation Rules','support-escalation-rules','When Experience Team must escalate a support issue to admin.',
$kb$Escalate to admin when:

- billing dispute
- refund/chargeback
- claim ownership dispute
- login/access issue affecting a paid location
- QR code points to wrong location
- public profile has incorrect owner
- reservation system is broken
- user reports safety, fraud, or harassment issue
- location requests deletion$kb$,
'published','internal',array['superadmin','admin','editor','viewer','experience_team']::text[],'policy',null,array['support','escalation','experience team']::text[],true,true,'support-experience-team','{}'::text[]),

    ('Internal Search Quality Rules','internal-search-quality-rules','Rules for search intent, LLM parsing, photo quality, and area relevance.',
$kb$TheOutHaven search should understand user intent such as restaurants, cuisines, activities, neighborhoods, boroughs, Long Island, NYC, Northern New Jersey, and Connecticut.

LLM parsing should separate food intent from activity intent.

Results without usable photos should not appear in live user-facing results unless approved.

When a user asks for walking distance pairing, results should favor restaurant/activity pairs within the configured walking-distance radius.

Location area strictness matters; do not show irrelevant far-away areas before the requested area.$kb$,
'published','internal',array['superadmin','admin','editor','viewer','experience_team']::text[],'guide',null,array['search','create outing','explore','llm','location quality']::text[],false,true,'admin-operations','{}'::text[]),

    ('Admin Import and Data Quality Guide','admin-import-and-data-quality-guide','Import and data-quality rules for admin operations.',
$kb$Import tools should avoid loading all records at once.

Use pagination.

Track imported, skipped, failed, found, and processed counts.

Fix cluttered import history with readable grouped summaries.

Keep photo status accurate.

Live results should not show locations with missing photos unless specifically allowed.$kb$,
'published','internal',array['superadmin','admin','editor','viewer']::text[],'guide',null,array['import','data quality','photos','locations']::text[],false,true,'admin-operations','{}'::text[]),

    ('How TheOutHaven Works','how-theouthaven-works','How guests and visitors use TheOutHaven to discover and plan outings.',
$kb$TheOutHaven helps people discover restaurants, lounges, activities, and local experiences for outings, birthdays, celebrations, and group plans.

Guests can explore places, create outing ideas, and discover location profiles.$kb$,
'published','public',array['superadmin','admin','editor','viewer']::text[],'faq',null,array['guests','outings','search']::text[],true,false,'public-help-center',array['user','visitor']::text[]),

    ('How to Claim Your Business','how-to-claim-your-business','How business owners can claim a location profile.',
$kb$Business owners can claim their profile using a claim link, QR code, or unique claim code.

The claim process helps verify the business and connect the owner to the profile.

If a claim code does not work, contact support.$kb$,
'published','public',array['superadmin','admin','editor','viewer']::text[],'faq',null,array['claim','business','location owner']::text[],true,false,'public-help-center',array['location_owner']::text[]),

    ('What Is the Pro Plan?','what-is-the-pro-plan','Public overview of TheOutHaven Pro Plan.',
$kb$The Pro Plan is a paid business plan for locations that want enhanced profile tools and stronger visibility.

Current listed price is $99/month.

TheOutHaven does not guarantee specific revenue or customer volume.$kb$,
'published','public',array['superadmin','admin','editor','viewer']::text[],'faq',null,array['pro plan','billing']::text[],true,false,'public-help-center',array['location_owner']::text[]),

    ('How to Contact Support','how-to-contact-support','How guests and business owners can contact TheOutHaven support.',
$kb$General support: [support@theouthaven.com](mailto:support@theouthaven.com)

Reservations support: [reserve@theouthaven.com](mailto:reserve@theouthaven.com)

Admin/business communication: [admin@theouthaven.com](mailto:admin@theouthaven.com) if already approved in project settings

Include what details to send: business name, profile link, claim code, screenshot, and issue description.$kb$,
'published','public',array['superadmin','admin','editor','viewer']::text[],'faq',null,array['support','contact']::text[],false,false,'public-help-center',array['user','location_owner','visitor']::text[]),

    ('Reservation Help for Guests','reservation-help-for-guests','Guest help for reservation and booking links.',
$kb$Some locations may include reservation or booking links.

TheOutHaven may direct guests to a location’s booking flow or a TheOutHaven reservation page.

For reservation issues, contact [reserve@theouthaven.com](mailto:reserve@theouthaven.com) with the location name and date/time.$kb$,
'published','public',array['superadmin','admin','editor','viewer']::text[],'faq',null,array['reservations','booking']::text[],false,false,'public-help-center',array['user','visitor']::text[])
)
insert into public.knowledge_base_articles (
  title, slug, excerpt, content, status, visibility, allowed_roles, article_type, template_type,
  tags, is_featured, ai_approved, category_id, public_audience, published_at, updated_at
)
select
  seed.title, seed.slug, seed.excerpt, seed.content, seed.status, seed.visibility, seed.roles,
  seed.article_type, seed.template_type, seed.tags, seed.featured, seed.ai, cats.id, seed.audience,
  case when seed.status = 'published' then now() else null end,
  now()
from seed_articles seed
join cats on cats.slug = seed.cat_slug
on conflict (slug, visibility) do update set
  title = excluded.title,
  excerpt = excluded.excerpt,
  content = excluded.content,
  status = excluded.status,
  allowed_roles = excluded.allowed_roles,
  article_type = excluded.article_type,
  template_type = excluded.template_type,
  tags = excluded.tags,
  is_featured = excluded.is_featured,
  ai_approved = excluded.ai_approved,
  category_id = excluded.category_id,
  public_audience = excluded.public_audience,
  published_at = case when excluded.status = 'published' then coalesce(public.knowledge_base_articles.published_at, excluded.published_at) else null end,
  updated_at = now();
