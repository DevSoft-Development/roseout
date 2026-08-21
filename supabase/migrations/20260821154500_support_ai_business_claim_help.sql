-- Public, AI-approved guidance for ordinary business claim assistance.
-- Idempotent: safe to run more than once.

with category as (
  select id
  from public.knowledge_base_categories
  where slug = 'public-help-center'
  limit 1
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
  'How to Claim Your Business on TheOutHaven',
  'support-how-to-claim-business',
  'First-line help for a business owner who wants to start or continue a normal location claim.',
  $kb$If you want to claim your restaurant, bar, venue, or other business on TheOutHaven, support can first help determine where you are in the claim process.

If you have a TheOutHaven claim QR code, claim link, or claim code, use that claim entry point for the specific business. If you are already looking at the business profile, use the available claim action for that location.

If you are not sure what to do next, tell support whether you are trying to start the claim, whether a QR code or claim link is not working, or whether the business appears to be already claimed. Support may also ask for the business name and location address so the correct listing can be identified.

Routine claim guidance and basic claim-link troubleshooting do not require an immediate human handoff. A human support team member is required when there is an ownership dispute, conflicting claimant, ownership-transfer request, identity-verification issue, or another protected ownership action.

Do not create duplicate business listings or multiple owner accounts just to work around a claim issue.$kb$,
  array['claim','claim business','claim restaurant','business owner','location owner','claim qr','claim link']::text[],
  false,
  true,
  array['location_owner']::text[],
  now(),
  now()
from category
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
