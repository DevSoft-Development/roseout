# TheOutHaven Production Readiness Checklist

This checklist is the source of truth for deciding whether TheOutHaven is production-ready.

Passing build, lint, and typecheck is not enough.

The app should not be considered production-ready unless the strict production check passes:

```bash
npm run production-check:strict
```

After deployment, the live production smoke test should pass:

```bash
npm run production-check:live
```

## 1. Public Pages

Required pages:

* Home page
* Explore page
* Create page
* Business page
* Business claim page
* Signup/login page
* Plan page
* Pricing page
* Location details pages

Production-ready means:

* No 404s
* No app crashes
* No duplicate footers
* No broken primary buttons
* No dead-end flows
* Mobile layout works
* Main CTAs are clear

## 2. Search

Production-ready means:

* Explore search works without page reload errors
* Create search works without crashing
* “rooftop dinner in Manhattan” returns relevant rooftop/dinner results or a clean empty state
* “steak dinner” returns relevant food/restaurant results or a clean empty state
* Borough/city/state searches respect geography
* Queens searches do not show New Jersey first
* Long Island and Long Island cities work
* Search does not scan every location slowly
* Search error messages do not appear during normal use

## 3. Auth

Production-ready means:

* /signup loads correctly
* Login form works
* Signup form works
* Forgot password works
* Password setup link works
* Expired password link shows a clean recovery option
* User login routes users correctly
* Admin login routes admins correctly
* Location owner login routes owners correctly
* Login does not just refresh the page

## 4. Admin

Production-ready means:

* Admin dashboard loads
* Admin routes are protected
* Admin topbar/dropdown appears where expected
* Reservations are easy to access
* Claims are organized under locations
* Users can be managed
* Delete user confirmation appears
* Logs show useful activity
* Admin pages are not cluttered

## 5. Business Claim Flow

Production-ready means:

* Business claim page loads
* QR scan flow works
* Manual claim code flow works
* No-code/manual claim form works
* Claim submissions create pending review records
* Captcha works where required
* Emails are sent for claim milestones
* Location owners can access approved locations only

## 6. QR Claim Codes

Production-ready means:

* QR codes generate for all imported locations
* QR claim code is created automatically on import
* Admin can print all QR claim codes
* Admin can print individual QR claim codes
* QR scan links work wherever shown
* QR codes do not stay stuck as pending after generation

## 7. Location Owner Dashboard

Production-ready means:

* Owner dashboard loads
* Owner can only access their own location
* Owner analytics are scoped correctly
* Owner can update allowed business information
* Owner cannot access admin-only data
* Owner plan/free/pro/reserve status is clear

## 8. Analytics

Production-ready means:

* One analytics system is active
* Old analytics system is removed or disabled
* Search analytics record correctly
* Location views record correctly
* Reserve/call/website clicks record correctly
* Admin analytics has bird’s-eye view
* Owner analytics only shows that owner’s location data
* Analytics does not break build if optional data is missing

## 9. Supabase and Security

Production-ready means:

* RLS is enabled on sensitive tables
* Public APIs expose only safe public data
* Admin APIs verify superadmin server-side
* Owner APIs verify ownership server-side
* Service role key is never exposed client-side
* Public env vars use the correct public prefix
* Captcha/rate limiting exists for sensitive flows
* No schema cache errors
* No missing-column runtime errors

## 10. SEO

Production-ready means:

* Public pages have title and description metadata
* Location details pages have SEO-friendly metadata
* Business page has metadata
* Sitemap exists
* Robots.txt exists
* Location pages use clean slugs
* Open Graph data exists
* Structured data is added where appropriate

## 11. Performance

Production-ready means:

* Search is fast
* Home page does not over-fetch
* Explore page does not load unnecessary data
* Images are optimized
* Heavy filters are not all client-side
* Build output does not warn about major performance issues
* Core pages load quickly on mobile

## 12. Deployment

Production-ready means:

* npm run production-check:strict passes before deploy
* Vercel preview works
* Production env vars are complete
* Supabase production env vars are correct
* Migrations are applied
* Live production smoke test passes after deploy
* Rollback plan exists

## Current Release Rule

Use this meaning:

```bash
npm run production-check
```

Build-safe only.

```bash
npm run production-check:strict
```

Release-safe.

```bash
npm run production-check:live
```

Live-site verified.

Do not call the app production-ready unless strict and live checks pass.
