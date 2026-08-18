-- Public, AI-approved common support issues for TheOutHaven first-line support.
-- Idempotent: safe to run more than once.

with category as (
  select id
  from public.knowledge_base_categories
  where slug = 'public-help-center'
  limit 1
), articles(title, slug, excerpt, content, tags, audience, featured) as (
  values
    (
      'I Cannot Access My TheOutHaven Account',
      'support-account-access',
      'Safe first steps when a guest or location owner cannot sign in.',
      $kb$If you cannot access your TheOutHaven account, first confirm that you are using the email address associated with the account and try the normal sign-in or password-reset flow available on TheOutHaven.

Do not send your password, authentication code, full payment-card number, or other sensitive credentials by SMS or email.

If you can sign in but cannot access a claimed location or business dashboard, tell support the business name and the email address you use for TheOutHaven. Support may need a human team member to verify account or location access.

Requests to change the account email, phone number, ownership, or other identity information require human review.$kb$,
      array['account','login','password','access','location owner']::text[],
      array['user','location_owner','visitor']::text[],
      true
    ),
    (
      'My Business Claim Code or QR Code Is Not Working',
      'support-claim-code-not-working',
      'Troubleshooting a location claim link, QR code, or claim code.',
      $kb$If a TheOutHaven business claim code, QR code, or claim link does not work, send support the business name, location address, and the claim code or profile link you were trying to use.

Common causes include an expired or already-used claim, a duplicate claim attempt, or a location that has already been claimed.

Do not create multiple owner accounts just to work around a claim problem.

If ownership is disputed, the location appears to be claimed by the wrong person, or the claim still cannot be completed after basic troubleshooting, a human support team member must review it.$kb$,
      array['claim','claim code','qr code','business owner','location owner']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'My Business Profile Is Already Claimed',
      'support-business-already-claimed',
      'What to do when a location profile appears to belong to another owner.',
      $kb$If your business profile is already claimed and you believe you are the correct owner or authorized manager, contact TheOutHaven Support with the business name, address, profile link, and your relationship to the business.

Do not attempt to bypass the existing claim by creating duplicate location records.

Ownership disputes and requests to transfer control of a claimed location require human verification before any account or ownership change is made.$kb$,
      array['claim','ownership','claimed profile','business profile']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'I Did Not Receive My Reservation Confirmation',
      'support-reservation-confirmation-missing',
      'What guests should check when a reservation confirmation is missing.',
      $kb$If you made a reservation through a TheOutHaven-supported reservation flow and did not receive a confirmation, check the email address and phone number used for the reservation, including spam or junk folders for email confirmations.

Send support the location name, reservation date, approximate time, and the name or contact information used for the reservation. Do not send payment-card details by text.

A missing confirmation does not by itself prove that a reservation was accepted. Support may need to verify the reservation record or escalate the issue.$kb$,
      array['reservation','confirmation','booking','guest']::text[],
      array['user','visitor']::text[],
      true
    ),
    (
      'How to Cancel or Reschedule a Reservation by Text',
      'support-reservation-cancel-reschedule-sms',
      'Using the reservation SMS conversation to request a cancellation or new time.',
      $kb$If you received a TheOutHaven reservation text message, you can reply in that same reservation SMS conversation with a clear request such as “cancel my reservation” or “I need to reschedule.”

For a reschedule request, include the new date or time you want when possible.

The system may ask a follow-up question if it needs to identify the correct reservation or understand the requested change.

If the request cannot be completed automatically, it should be routed for human follow-up. A cancellation or reschedule is not final until the system or support confirms the change.$kb$,
      array['reservation','cancel','reschedule','sms','booking']::text[],
      array['user','visitor']::text[],
      true
    ),
    (
      'My Location Information Is Wrong on TheOutHaven',
      'support-location-information-wrong',
      'How guests and owners can report incorrect business details.',
      $kb$If a location has incorrect hours, phone number, website, category, address, reservation link, photos, or other public information, send support the location name, profile link, and the specific information that appears to be wrong.

Claimed location owners should use their location dashboard for business information they are permitted to manage.

Guests can report inaccurate information to support. TheOutHaven may verify the correction before changing canonical location data.$kb$,
      array['location','hours','phone','website','category','photos','data quality']::text[],
      array['user','visitor','location_owner']::text[],
      true
    ),
    (
      'My Logo, Photos, Menu, or Business Content Is Missing',
      'support-location-content-missing',
      'Help for location owners managing profile and website content.',
      $kb$Claimed location owners can manage supported business content from their TheOutHaven location dashboard, including profile information and supported media or website content where those tools are enabled.

If a logo, photo, menu, hours section, review content, or website-builder content is missing or not appearing correctly, send support the business name, the page where the issue appears, and a screenshot if possible.

Do not create a duplicate location to fix missing content. Support can determine whether the issue is an upload, publishing, data, or website-generation problem.$kb$,
      array['logo','photos','menu','website builder','location dashboard','content']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'TheOutHaven Search Is Showing the Wrong Result',
      'support-search-wrong-result',
      'How to report stale, irrelevant, or inaccurate discovery results.',
      $kb$TheOutHaven search uses location, category, activity, cuisine, event, and outing information to return relevant results.

If search shows a location that is closed, too far from the requested area, incorrectly categorized, missing important information, or otherwise clearly wrong, send support the search you used and the incorrect result.

Include the location name and what should be corrected. Search-quality and canonical-data issues may require review before the result changes.$kb$,
      array['search','wrong result','closed location','category','distance','data quality']::text[],
      array['user','visitor','location_owner']::text[],
      false
    ),
    (
      'Questions About the TheOutHaven Pro Plan',
      'support-pro-plan-questions',
      'Basic public guidance for location owners with Pro Plan questions.',
      $kb$TheOutHaven Pro is a paid plan for eligible business locations that want enhanced business-profile and platform tools.

Use the current pricing and feature information shown in TheOutHaven's official plan or billing screens because plan details may change.

TheOutHaven does not guarantee a specific number of customers, bookings, revenue, or search placement.

General plan questions can be answered by support. Refunds, charge disputes, unauthorized charges, payment-method changes, or account-specific billing actions require human support review.$kb$,
      array['pro plan','billing','subscription','location owner','pricing']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'I Need Help With My TheOutHaven Location Website',
      'support-location-website-help',
      'Troubleshooting a generated location website, custom domain, or published business site.',
      $kb$Some eligible TheOutHaven locations can use website-generation and hosting tools connected to their location dashboard.

If a generated site has incorrect business content, missing sections, wrong branding, a publishing problem, or a custom-domain issue, send support the business name, website URL, and a description or screenshot of the problem.

Do not change DNS records or domain ownership based only on an automated support message. Domain ownership, DNS changes, and account-sensitive website actions should be reviewed by a human when verification is required.$kb$,
      array['website','website builder','domain','hosting','location owner']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How TheOutHaven Support SMS Works',
      'support-sms-conversation',
      'How to get help by texting the dedicated TheOutHaven support number.',
      $kb$You can text TheOutHaven Support in normal language and describe the problem you are having. You do not need to use a special command to explain the issue.

The support system keeps messages for the same open support case in one conversation so follow-up questions and replies can continue by text.

The automated first-line assistant may answer common questions or ask a focused follow-up question using approved TheOutHaven help information.

You can ask for a human at any time. Sensitive issues such as billing disputes, refunds, fraud, account-identity changes, ownership disputes, legal or safety issues should be handed to a human support team member.

Never text passwords, authentication codes, full card numbers, bank credentials, or other secrets.$kb$,
      array['support','sms','text support','ai support','human support']::text[],
      array['user','visitor','location_owner']::text[],
      true
    ),
    (
      'When TheOutHaven Support Will Hand You to a Person',
      'support-human-handoff',
      'Issues that require a human support team member.',
      $kb$TheOutHaven's automated support can help with common questions and basic troubleshooting, but some requests require a person.

A human support team member should take over for refunds, charge disputes, suspected fraud or unauthorized access, account email or phone changes, ownership or claim disputes, account deletion, legal or safety concerns, and other requests that require identity verification or a protected account action.

You can also simply ask to speak with a person. Continue replying in the same support text thread so the human agent can see the conversation history.$kb$,
      array['support','human','handoff','escalation','security']::text[],
      array['user','visitor','location_owner']::text[],
      true
    )
)
insert into public.knowledge_base_articles (
  category_id,
  title,
  slug,
  excerpt,
  content,
  status,
  visibility,
  allowed_roles,
  article_type,
  tags,
  is_featured,
  ai_approved,
  public_audience,
  published_at,
  updated_at
)
select
  category.id,
  articles.title,
  articles.slug,
  articles.excerpt,
  articles.content,
  'published',
  'public',
  array['superadmin','admin','editor','viewer']::text[],
  'faq',
  articles.tags,
  articles.featured,
  true,
  articles.audience,
  now(),
  now()
from articles
cross join category
on conflict (slug, visibility) do update set
  category_id = excluded.category_id,
  title = excluded.title,
  excerpt = excluded.excerpt,
  content = excluded.content,
  status = excluded.status,
  allowed_roles = excluded.allowed_roles,
  article_type = excluded.article_type,
  tags = excluded.tags,
  is_featured = excluded.is_featured,
  ai_approved = excluded.ai_approved,
  public_audience = excluded.public_audience,
  published_at = coalesce(public.knowledge_base_articles.published_at, excluded.published_at),
  updated_at = now();
