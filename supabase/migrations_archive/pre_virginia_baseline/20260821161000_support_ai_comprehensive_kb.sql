-- Comprehensive public, AI-approved support coverage derived from the current TheOutHaven product.
-- Idempotent: article slugs are upserted against the existing (slug, visibility) uniqueness rule.

with category as (
  select id
  from public.knowledge_base_categories
  where slug = 'public-help-center'
  limit 1
), articles(title, slug, excerpt, content, tags, audience, featured) as (
  values
    (
      'How TheOutHaven Search and Outing Planning Works',
      'support-search-and-outing-planning',
      'How guests use TheOutHaven to discover restaurants, activities, and complete outings.',
      $kb$TheOutHaven helps guests discover places to eat, drink, celebrate, and go out. Search can return a single location or combine a restaurant and activity into an outing when the request calls for both.

Describe what you want in normal language, including the area, cuisine or activity, occasion, distance preference, or other useful details. If the result is not what you meant, refine the request with the missing detail rather than starting over.

If search returns no results, an obviously wrong area, the wrong type of place, or stale location information, tell support the exact search and the result that looked wrong so the issue can be narrowed down.$kb$,
      array['search','outing','recommendations','explore','restaurants','activities']::text[],
      array['user','visitor']::text[],
      true
    ),
    (
      'TheOutHaven Search Is Showing the Wrong Result',
      'support-search-wrong-result',
      'How to troubleshoot irrelevant, distant, closed, or incorrectly categorized search results.',
      $kb$If TheOutHaven search shows a location that is closed, too far from the requested area, incorrectly categorized, or otherwise clearly wrong, send support the search wording you used and the location that should not have appeared.

For a location-data problem, include what is wrong, such as hours, address, category, phone, website, reservation link, or whether the location is closed. Search and canonical-location corrections may be reviewed before the public result changes.$kb$,
      array['search','wrong result','closed location','category','distance','data quality']::text[],
      array['user','visitor','location_owner']::text[],
      true
    ),
    (
      'Why TheOutHaven May Show No Search Results',
      'support-search-no-results',
      'Troubleshooting a search that returns no places or no complete outing.',
      $kb$A search can return no result when the request is too restrictive for the available locations, when a requested restaurant/activity combination cannot be paired within the requested area or walking range, or when qualifying location data is unavailable.

Try relaxing one condition at a time, such as the neighborhood, walking requirement, cuisine, activity type, or timing. If a normal request still returns nothing, send support the exact search text and the area you expected.$kb$,
      array['search','no results','outing','walking','location']::text[],
      array['user','visitor']::text[],
      false
    ),
    (
      'How to Report Incorrect Business Information',
      'support-location-information-wrong',
      'How guests and owners can report incorrect hours, phone, website, address, category, photos, or reservation links.',
      $kb$If a location has incorrect hours, phone number, website, category, address, reservation link, photos, or other public information, send support the location name, profile link if available, and the specific information that appears to be wrong.

Claimed location owners should use their location dashboard for information they are permitted to manage. Guests can report inaccurate information to support. TheOutHaven may verify a correction before changing canonical location data.$kb$,
      array['location','hours','phone','website','category','photos','data quality','correction']::text[],
      array['user','visitor','location_owner']::text[],
      true
    ),
    (
      'How TheOutHaven Support SMS Works',
      'support-sms-conversation',
      'How to get help by texting the dedicated support number and continue in one ticket thread.',
      $kb$Text TheOutHaven Support at (516) 200-0801 in normal language. You do not need a special command to describe the issue.

The support system keeps messages for the same active case in one conversation so the automated assistant or a human agent can continue from the existing context. The automated assistant should answer routine questions and may ask focused follow-up questions until it has enough information.

You can ask for a human at any time. Never text passwords, authentication codes, full card numbers, bank credentials, or other secrets.$kb$,
      array['support','sms','text support','ai support','human support','0801']::text[],
      array['user','visitor','location_owner']::text[],
      true
    ),
    (
      'Which TheOutHaven Phone or Text Number Should I Use?',
      'support-contact-lines',
      'The current support, reservations, and sales contact lines.',
      $kb$For general support, text (516) 200-0801. For reservation help by text, use (516) 200-0601. For sales calls, call (516) 200-0811. Sales can also be reached by text at (516) 200-0701.

The support and reservation lines are text-only. The main voice number is reserved for sales calls.$kb$,
      array['support number','reservations number','sales number','0801','0601','0811','0701']::text[],
      array['user','visitor','location_owner']::text[],
      true
    ),
    (
      'What Happens After I Submit the Contact Form?',
      'support-contact-form-ticket',
      'How the public contact form creates and confirms a support ticket.',
      $kb$The public contact form creates a support ticket automatically. You must provide a name, a message, and at least an email address or mobile number.

If you provide only a mobile number, you must agree to the support text terms so TheOutHaven can confirm the submission by SMS. When contact information and consent allow it, confirmation can be sent by email, text, or both. The success screen can include a link to view or reply to the ticket.$kb$,
      array['contact form','support ticket','confirmation','email','sms']::text[],
      array['user','visitor','location_owner']::text[],
      false
    ),
    (
      'Support Ticket Statuses and Automatic Closure',
      'support-ticket-status-lifecycle',
      'What open, waiting, escalated, resolved, closed, and reopened mean.',
      $kb$An active support case may move through open, pending, waiting on customer, waiting on internal work, or escalated states. Resolved means the issue has a solution and is waiting through a short follow-up window. Closed means the case is finished.

Resolved tickets are automatically closed after 48 hours without a new customer reply. If you reply before closure, the same conversation can continue. A recent closed SMS case may reopen when you text again instead of forcing a duplicate ticket.$kb$,
      array['ticket','status','resolved','closed','reopened','48 hours']::text[],
      array['user','visitor','location_owner']::text[],
      false
    ),
    (
      'When TheOutHaven Support Needs a Human',
      'support-human-handoff',
      'Issues the automated assistant can explain versus actions that require staff review.',
      $kb$The automated support assistant can handle routine questions, navigation help, setup guidance, common troubleshooting, and product explanations using approved TheOutHaven information.

A human is required for refunds or charge disputes, suspected fraud or unauthorized access, legal or safety issues, changes to protected account identity/contact information, destructive account actions, ownership-transfer or ownership-dispute decisions, protected payment changes, and other actions that require identity verification or privileged staff access.

You can also ask for a human at any time. Continue replying in the same support thread so the agent can see the conversation history.$kb$,
      array['support','human','handoff','escalation','security']::text[],
      array['user','visitor','location_owner']::text[],
      true
    ),
    (
      'I Cannot Access My TheOutHaven Account',
      'support-account-access',
      'Safe first steps for sign-in, password access, and missing business-dashboard access.',
      $kb$If you cannot access your TheOutHaven account, first confirm that you are using the email address associated with the account and try the normal sign-in or password-reset flow available on TheOutHaven.

Do not send your password or authentication code to support. If the email does not arrive, check spam or junk and confirm the address was entered correctly.

If you can sign in but cannot access a claimed location or business dashboard, tell support the business name and the email address you use for TheOutHaven. Support can troubleshoot normal access, but identity/contact changes or protected ownership changes require human verification.$kb$,
      array['account','login','password','access','business dashboard','owner access']::text[],
      array['user','location_owner','visitor']::text[],
      true
    ),
    (
      'How to Claim Your Business on TheOutHaven',
      'support-how-to-claim-business',
      'The normal claim flow for a restaurant, bar, venue, activity, or other location.',
      $kb$If you have a TheOutHaven claim QR code, claim link, or claim code, open that claim entry point. The code opens the exact business profile, so you do not need to search for the business again.

The claim page shows the business name, photo when available, address, claim status, profile strength, and missing profile items. Choose Claim This Business, then verify a business email or mobile number you can access. A six-digit verification code is used to verify that contact.

After the contact is verified, the claim is saved. If the verified contact matches information already associated with the business, the ownership match may be easier to approve. If it does not match, the claim can remain saved while ownership is reviewed. No plan selection or full account setup is required before the claim itself is submitted.$kb$,
      array['claim','claim business','claim restaurant','business owner','location owner','claim qr','claim link']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How to Claim a Business Without a Claim Code',
      'support-claim-without-code',
      'What to do when an owner wants to claim a location but does not have the mailed code.',
      $kb$TheOutHaven supports a no-code claim path for owners who do not have the mailing-label claim code. Use the business-claim no-code flow to identify the correct location and begin ownership verification.

If you do have a printed claim code or QR, use it instead because it is already tied to the exact location and avoids a business search. If the no-code flow cannot identify the correct listing, provide support with the business name and full address so the listing can be located.$kb$,
      array['claim','no code','without code','business search','owner']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'My Business Claim Code or QR Code Is Not Working',
      'support-claim-code-not-working',
      'Troubleshooting expired, used, invalid, or already-claimed business claim codes.',
      $kb$If a claim code or QR cannot be verified, check that the full code was entered exactly as printed. A valid code should open the exact business profile.

The claim page can report that a business is already claimed, a code was already used, a code expired, or the code could not be verified. An expired code requires a replacement. A used code may mean a claim was already started. If the profile is already claimed by someone else, support can explain the next information needed for ownership review.

Do not create duplicate business listings or multiple owner accounts to work around a claim problem.$kb$,
      array['claim','claim code','qr code','expired code','used code','business owner']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'I Did Not Receive My Business Claim Verification Code',
      'support-claim-otp-not-received',
      'Troubleshooting the six-digit email or SMS code used during business claiming.',
      $kb$During a claim, choose either a business email or a mobile number you can access and complete the security check before requesting the code.

If the code does not arrive, confirm the email address or mobile number, check spam or junk for email, and try again after a short wait. Too many verification attempts can be rate-limited temporarily.

The six-digit code expires after 10 minutes. If it expires or too many incorrect attempts are made, request a new code. Never send the verification code to support.$kb$,
      array['claim','otp','verification code','6 digit','expired','rate limited']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'What Does Claim Pending or Claim Verified Mean?',
      'support-claim-pending-review',
      'What happens after contact verification and why some claims still need ownership review.',
      $kb$Contact verification proves that you can access the email address or mobile number used in the claim. It does not always prove ownership by itself.

After verification, the claim is saved. If the verified contact matches information already associated with the business, TheOutHaven can use that as a stronger ownership signal. If it does not match, the claim can remain pending while the ownership match is reviewed.

You do not need to scan the QR or start the claim again while a saved claim is pending.$kb$,
      array['claim pending','claim verified','ownership review','contact match']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How Owner Account Access Works After a Business Claim',
      'support-owner-access-after-claim',
      'How email and mobile claims connect to the business dashboard.',
      $kb$If you claimed with a business email, the claim page can send a secure owner-access link after the claim is saved. Opening that link signs in or creates the business-owner account and attempts to link it to the saved claim.

The claim is already saved before this account-link step, so you do not need to rescan the QR if the email link is delayed. If you claimed with a mobile number, the claim can still be complete and owner-account setup can happen after verification review.

Once owner access is linked and approved, use the location dashboard to manage the business.$kb$,
      array['owner account','claim','magic link','business dashboard','email claim','mobile claim']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'My Business Profile Is Already Claimed',
      'support-business-already-claimed',
      'What to provide when a location appears to belong to another claimant.',
      $kb$If the business profile is already claimed, first confirm that you are viewing the correct location and address. Support can collect the business name, full address, profile link if available, and your relationship to the business.

Do not create a duplicate location or another owner account to bypass the existing claim. If control must be transferred, the existing claim appears unauthorized, or there is a conflict between claimants, a human ownership review is required before management access can change.$kb$,
      array['claim','ownership','already claimed','wrong owner','business profile']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How to Update Your Business Profile',
      'support-owner-business-profile',
      'Managing the public details guests use to call, visit, reserve, and plan an outing.',
      $kb$Claimed location owners can use Business Profile in the location dashboard to manage supported public details used by guests and TheOutHaven discovery.

Typical profile information includes contact details, location information, categories, and other supported discovery fields. If a field is not editable in the dashboard or the public page does not reflect a saved change, tell support the business name, the field, and what you expected to see.$kb$,
      array['business profile','location dashboard','contact details','discovery','owner']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How to Manage Hours and Reservation Capacity',
      'support-owner-hours-capacity',
      'Where business hours and reservation capacity are managed.',
      $kb$Business hours used by the location profile should be maintained in the supported location-dashboard profile or hours controls. Reservation operating hours and capacity are managed in the Reservations settings area under Hours & Capacity.

If the hosted website is enabled, its hours section is connected to the real location data rather than invented by the website AI. If hours are wrong in more than one place, correct the source data first and then allow the connected views to refresh.$kb$,
      array['hours','capacity','reservation settings','website','business profile']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How to Manage Your Logo, Photos, and Branding',
      'support-owner-branding-photos',
      'Business logo, hero image, accent color, and public visual assets.',
      $kb$The location dashboard includes Branding controls for supported brand assets such as the logo, hero image, and accent color. Photos and other business content can also feed the public profile and hosted website when connected.

If a logo or photo is missing after upload, tell support the business name, where you uploaded it, and where it is missing. Do not create a duplicate location to fix a media problem.$kb$,
      array['branding','logo','photos','hero image','accent color','business profile']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Menu / Packages Works',
      'support-owner-menu-packages',
      'Publishing menu pages, packages, sections, items, pricing, PDFs, and external links.',
      $kb$Menu / Packages in the location dashboard can publish supported menu pages and packages with sections, items, pricing, PDFs, or external links.

The hosted website can connect to a published menu and use the real menu items as grounded content. If the website says the menu is not connected, publish the menu in the dashboard first. If a saved item or price is wrong, correct the menu source rather than editing generated website copy to contradict it.$kb$,
      array['menu','packages','items','pricing','pdf','external link','website']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'Reservation Help for Guests',
      'support-guest-reservation-basics',
      'What guests should know about TheOutHaven-supported reservations.',
      $kb$Reservation availability and rules are controlled by the location. A reservation is not final until the booking flow or location confirms it.

For reservation-specific text help, use (516) 200-0601. Keep the conversation on that reservation line so automated reservation actions and the reservation history stay together.

If support needs to identify a booking, be ready to provide the location, reservation date, approximate time, and the name or contact information used for the reservation. Do not send full payment-card details.$kb$,
      array['reservation','booking','guest','0601','confirmation']::text[],
      array['user','visitor']::text[],
      true
    ),
    (
      'I Did Not Receive My Reservation Confirmation',
      'support-reservation-confirmation-missing',
      'What to check when a reservation confirmation is missing.',
      $kb$If you made a reservation through a TheOutHaven-supported flow and did not receive a confirmation, check the email address and mobile number used for the reservation and check spam or junk for email confirmations.

Send reservation support the location name, reservation date, approximate time, and the name or contact information used for the reservation. A missing confirmation does not by itself prove that the reservation was accepted.$kb$,
      array['reservation','confirmation','booking','guest']::text[],
      array['user','visitor']::text[],
      true
    ),
    (
      'How to Cancel or Reschedule a Reservation by Text',
      'support-reservation-cancel-reschedule-sms',
      'Using the reservation SMS conversation to request a cancellation or new date/time.',
      $kb$Use the reservation text line at (516) 200-0601 and reply in the same reservation conversation with a clear request such as cancel my reservation or I need to reschedule.

For a reschedule, include the new date or time when possible. The system may ask a follow-up question if it needs to identify the correct reservation or understand the requested change.

A cancellation or reschedule is not final until the system or support confirms the change.$kb$,
      array['reservation','cancel','reschedule','sms','booking','0601']::text[],
      array['user','visitor']::text[],
      true
    ),
    (
      'How to Change Reservation Party Size or Arrival Time',
      'support-reservation-party-time-change',
      'Changing party size or timing in a natural-language reservation text conversation.',
      $kb$On the reservation text line, describe the change naturally, for example that the party will now have a different number of guests or that you expect to arrive at a different time.

Include the new party size or time explicitly when possible. The reservation system may ask a clarification before applying a change. The change is not final until a confirmation is returned.$kb$,
      array['reservation','party size','time change','arrival','sms']::text[],
      array['user','visitor']::text[],
      false
    ),
    (
      'What Reservation Statuses Mean',
      'support-reservation-statuses',
      'Common reservation states such as pending, confirmed, checked in, seated, completed, cancelled, and no-show.',
      $kb$A reservation can move through operational states such as pending, confirmed, checked in or waiting, seated, completed, cancelled, declined, or no-show depending on the location workflow.

The location manages these states from its reservation command center. A guest should rely on the most recent confirmation or reservation message rather than assuming a status from an earlier request.$kb$,
      array['reservation status','pending','confirmed','checked in','seated','cancelled','no show']::text[],
      array['user','visitor','location_owner']::text[],
      false
    ),
    (
      'How Reservation Deposits and Policies Work',
      'support-reservation-deposits-policies',
      'Location-controlled reservation deposits and policy settings.',
      $kb$Reservation deposits and policies are configured by the participating location. A location can use its Reservations settings to manage supported deposit and policy behavior.

Guests should review the specific reservation terms shown for that booking. General questions about how a deposit works can be explained by support, but refunds, charge disputes, payment-method changes, or unauthorized-charge claims require human review.$kb$,
      array['reservation','deposit','policy','payment','location owner']::text[],
      array['user','visitor','location_owner']::text[],
      false
    ),
    (
      'How a Location Sets Up TheOutHaven Reservations',
      'support-owner-reservation-setup',
      'Reservation mode, calendar, resources, guests, waitlist, reminders, deposits, and settings.',
      $kb$The Reservations workspace includes Host View, Today, Calendar, Floor / Tables / Spaces, Guests, Waitlist, and Reservation Settings.

Location owners can configure layout and spaces, hours and capacity, reminder behavior, deposits and policies, and other reservation settings. Choose the reservation mode that matches the location workflow before relying on incoming requests.

If the reservation view is empty or unavailable, first confirm that the correct claimed location is active and that reservation setup is complete.$kb$,
      array['reservation setup','host view','calendar','floor','guests','waitlist','settings']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How to Check In, Seat, and Complete Reservations',
      'support-owner-reservation-status-flow',
      'The operational flow from confirmation through seating and completion.',
      $kb$In the reservation command center, a location can confirm a reservation, check the guest in, seat the party, and complete the reservation. Cancelled, declined, and no-show states are also available when appropriate.

A reservation needs an assigned table, booth, room, lane, or other configured resource before it can be seated when the location uses resource assignment. If seating fails, confirm the guest is checked in and that an available resource is configured and assigned.$kb$,
      array['reservation','check in','seat','complete','resource','table','room']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Reservation Tables, Booths, Rooms, Lanes, and Spaces Work',
      'support-owner-reservation-resources',
      'Setting up and assigning reservable resources in the floor and layout tools.',
      $kb$The reservation system can use location-specific resources such as tables, booths, bar seats, rooms, lanes, or other spaces. Configure these resources in Floor / Tables / Spaces and Layout & Spaces.

When seating a guest, choose a valid resource that is available for that reservation time. If the resource is already unavailable, choose another one. If no resources exist, set up the location layout before using resource-based seating.$kb$,
      array['reservation','table','booth','room','lane','space','floor','layout']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How the Reservation Waitlist and Walk-Ins Work',
      'support-owner-waitlist-walkins',
      'Managing same-day waitlist entries and walk-in guests.',
      $kb$The reservation command center includes a Waitlist area and controls for walk-ins. Use these tools for guests who do not already have a standard reservation.

Keep the correct location and date selected when reviewing the waitlist. If a waitlist entry or walk-in is missing, confirm that it was created for the same location and day being viewed.$kb$,
      array['waitlist','walk in','reservation','guest','same day']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How Reservation Reminders Work for Locations',
      'support-owner-reservation-reminders',
      'Where a location manages reservation reminder behavior.',
      $kb$Reservation reminder settings are available in the location Reservations workspace under Reminders. Use that area to configure supported reminder behavior for the active location.

If a guest reports that a reminder did not arrive, confirm the reservation contact information and reservation status first. Delivery-specific issues can then be narrowed to the affected reservation.$kb$,
      array['reservation','reminder','sms','location settings']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How to Create and Publish a Location Event',
      'support-owner-events-create-publish',
      'Creating draft events with real calendar/time pickers and publishing them to TheOutHaven.',
      $kb$In Events & Experiences, create an event by entering the event name, category, description, optional cover image, venue details, date and time, ticket settings, capacity, and public URL slug.

The event date uses a real calendar and the time uses a 12-hour picker. Eastern Time is applied automatically, so there is no time-zone field to manage.

A new event is created as a draft. Publish it when it is ready to be public. Published events automatically appear on the location public TheOutHaven page and can feed the hosted website content.$kb$,
      array['event','create event','publish event','draft','calendar','Eastern Time']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Event Tickets, Capacity, and Fees Work',
      'support-owner-event-tickets-fees',
      'Free or paid event registration, capacity, and fee-payer settings.',
      $kb$A location event can enable tickets or registration, be free or paid, and optionally set capacity. For a paid event, enter the ticket price and make sure TheOutHaven Payments readiness is complete before relying on paid ticketing.

The event setup supports customer-pays-fees, location-pays-fees, or split-fees behavior. Ticket sales and attendance metrics are available from the event overview.$kb$,
      array['event','tickets','capacity','fees','paid event','free event','payments']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Event Ticket Check-In Works',
      'support-event-ticket-checkin',
      'Using TheOutHaven event ticket and attendance tools at the venue.',
      $kb$Published ticketed events can track tickets and checked-in attendance from the event management area. Use the event overview for sales, ticket, and attendance information.

If a ticket cannot be found at check-in, confirm that the guest is using the correct event and ticket information before treating it as a payment or ownership problem.$kb$,
      array['event','ticket','check in','attendance','qr']::text[],
      array['user','visitor','location_owner']::text[],
      false
    ),
    (
      'How to Create and Publish an Experience',
      'support-owner-experience-create-publish',
      'Creating a bookable experience with duration, party sizes, price, and first availability.',
      $kb$In Events & Experiences, create an experience with a name, category, description, optional cover image, duration, minimum and maximum party size, price per person, and initial available date/time.

Use $0 for a free experience. The initial availability uses a real calendar and 12-hour time picker, and Eastern Time is applied automatically.

The experience remains a draft until published. Published experiences automatically appear on the public location page and can feed hosted website content.$kb$,
      array['experience','create experience','publish','duration','party size','price','Eastern Time']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Experience Availability and Time Slots Work',
      'support-owner-experience-availability',
      'Adding bookable times and capacity to an existing experience.',
      $kb$Each experience can have scheduled availability slots. When creating the experience, add at least one initial available time so it can be bookable immediately after publishing.

For additional times, open the experience management area and add a date/time, duration, and capacity. An experience can be published or paused without deleting its configuration.$kb$,
      array['experience','availability','slot','capacity','booking','pause']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'I Need Help With My TheOutHaven Location Website',
      'support-location-website-help',
      'Website Builder, publishing, generated copy, real location content, and domains.',
      $kb$Eligible locations can use Website Builder from the location dashboard. The builder generates presentation and section copy while real business facts remain grounded in the location dashboard.

Hours, photos, published menu items, published events, published experiences, approved reviews, contact details, and reservations can feed the hosted website. If something is missing, fix or publish the source content in the dashboard first.

For a publishing or domain issue, provide support with the business name, website URL, and what happens when you try to publish or open the site.$kb$,
      array['website','website builder','domain','hosting','publish','location owner']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'What Content Automatically Syncs to a Location Website?',
      'support-location-website-content-sync',
      'The real dashboard data connected to generated location websites.',
      $kb$The hosted location website can connect to real hours, photos, menu items, published events, published experiences, approved reviews, contact information, and reservation information from the location dashboard.

The website AI may write presentation copy and choose a section structure, but it should not invent real business hours, menu items, events, experiences, reviews, contact details, or reservation facts. Update the dashboard source when a factual item is wrong.$kb$,
      array['website','auto sync','hours','photos','menu','events','experiences','reviews']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How TheOutHaven Location Domains Work',
      'support-location-domain',
      'Using a TheOutHaven-hosted URL or connecting a supported custom domain.',
      $kb$Website Builder includes domain controls for the location website. A location can use its hosted TheOutHaven website address and, where supported, connect a custom domain through the dashboard domain workflow.

Do not change DNS records based only on an automated support guess. If a custom-domain connection requires ownership verification or a DNS change outside the guided flow, support can explain the expected step and a human can review protected domain ownership actions when necessary.$kb$,
      array['website','domain','custom domain','dns','hosting']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How Growth Hub QR Codes Work',
      'support-owner-growth-qr-codes',
      'QR codes for menu, offers, VIP, check-in, reservations, events, and reviews.',
      $kb$The location dashboard QR Codes area can generate and monitor supported Growth Hub QR codes for menu, offers, VIP signup, check-in, reservations, events, and reviews.

If a QR does not open the expected destination, identify which QR type it is and what page or error appears after scanning. Claim-mailer QR codes are a separate ownership-claim flow and should open the exact location claim page.$kb$,
      array['qr code','menu','offers','vip','check in','reservations','events','reviews']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Event Leads Work for Locations',
      'support-owner-leads',
      'Tracking private-party and event inquiries from new through booked or lost.',
      $kb$The Leads area tracks private-party and event inquiries for the location. A lead can move through the location sales process until it is booked, completed, or lost.

Use the lead record and location notification tools to keep the inquiry connected to the correct business. If a lead is missing, confirm the inquiry was submitted for the same claimed location.$kb$,
      array['leads','event inquiry','private party','booked','lost','location']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How Offers Work for Locations',
      'support-owner-offers',
      'Creating offers, tracking customer claims, and confirmations.',
      $kb$The Offers area lets a location create supported offers and monitor customer claims. Offer activity can be included in Growth Pro analytics.

Customer confirmations use TheOutHaven's messaging infrastructure where configured. If an offer is not appearing or a claim count looks wrong, identify the offer and whether the issue is creation, public visibility, claiming, or confirmation delivery.$kb$,
      array['offers','offer claim','promotion','confirmation','analytics']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How the VIP List Works',
      'support-owner-vip-list',
      'VIP signups, contact growth, birthday information, and SMS consent.',
      $kb$The VIP List area tracks supported VIP signups for a location, including contact growth, consent status, and birthday-month information when provided.

SMS consent matters independently of whether a contact appears on the VIP list. Do not treat a VIP signup as permission for unrelated promotional texting unless the required consent is present.$kb$,
      array['vip','vip list','signup','sms consent','birthday','contact']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Location Notifications Work',
      'support-owner-notifications',
      'Recipients, preferences, unread alerts, high-priority events, and recent activity.',
      $kb$The Notifications area lets a location review recipients, notification preferences, unread alerts, high-priority events, and recent activity.

If an expected notification is missing, confirm that the correct recipient is configured and that the relevant preference is enabled before troubleshooting delivery.$kb$,
      array['notifications','recipient','preferences','alerts','location']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How Reviews and Private Feedback Work',
      'support-reviews-feedback',
      'Verified TheOutHaven reviews, private feedback, low-rating alerts, and post-visit review behavior.',
      $kb$TheOutHaven distinguishes public reviews from private feedback. Location owners can review private feedback, verified TheOutHaven reviews, low-rating alerts, and related review activity from the dashboard.

Guest reviews are intended for post-visit feedback. Content can be held for moderation when necessary. If a review is missing, provide the location and approximate visit/review information rather than submitting repeated duplicate reviews.$kb$,
      array['reviews','feedback','rating','verified review','moderation','post visit']::text[],
      array['user','visitor','location_owner']::text[],
      true
    ),
    (
      'My Logo, Photos, Menu, or Business Content Is Missing',
      'support-location-content-missing',
      'How to troubleshoot missing owner-managed content across profile and website views.',
      $kb$If a logo, photo, menu, hours section, review content, event, experience, or website-builder section is missing, first confirm that the source item exists in the location dashboard and is published when publication is required.

The hosted website and public profile rely on real location data. Send support the business name, the dashboard area where the content exists, the public page where it is missing, and a screenshot if possible. Do not create a duplicate location to work around missing content.$kb$,
      array['logo','photos','menu','website builder','location dashboard','content','missing']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Location Messaging and Campaign Drafts Work',
      'support-owner-messaging',
      'Approved templates, campaign drafts, approvals, SMS credits, and consent-safe messaging.',
      $kb$The location Messaging area supports approved templates, campaign drafts, approval requests, SMS-credit guardrails, and consent-aware messaging tools.

A saved contact is not automatically eligible for every marketing message. Respect the consent state and the messaging purpose. If a campaign cannot be sent, identify whether the block is approval, consent, SMS credits, or another delivery requirement.$kb$,
      array['messaging','campaign','template','approval','sms credits','consent']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'How Marketing Studio Works',
      'support-owner-marketing-studio',
      'Suggested Monthly Ideas and draft copy generated from live location data.',
      $kb$Marketing Studio can generate Suggested Monthly Ideas and draft marketing copy from the location's live data. Generated content should remain grounded in the actual business information available to TheOutHaven.

Review generated copy before publishing or sending it. If an idea references missing or incorrect business information, correct the location data first and regenerate or edit the draft.$kb$,
      array['marketing studio','ai marketing','monthly ideas','draft copy','location data']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How the Promotion Center Works',
      'support-owner-promotions',
      'Location visibility and high-intent promotion opportunities.',
      $kb$The Promotion Center is the location dashboard area for supported visibility and promotion opportunities. Availability can depend on the active business plan and the current product configuration.

Use the current Promotion Center and billing screens as the source of truth for available options. TheOutHaven does not guarantee a specific number of customers, bookings, revenue, or search placement from a promotion.$kb$,
      array['promotion center','promotions','visibility','growth','plan']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'What Location Analytics Includes',
      'support-owner-analytics',
      'Profile, QR, offers, VIP, leads, reservations, feedback, and marketing activity.',
      $kb$The location Analytics area summarizes supported business activity such as profile engagement, QR scans, offer claims, VIP signups, event leads, reservation requests, feedback/reviews, and marketing activity.

If a number looks wrong, identify the metric and time period first. Some metrics reflect events recorded by TheOutHaven and may not equal a third-party system's totals.$kb$,
      array['analytics','qr scans','offer claims','vip','leads','reservations','feedback','marketing']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'Questions About the TheOutHaven Business Plan',
      'support-pro-plan-questions',
      'Plan status, feature readiness, checkout, and billing navigation for locations.',
      $kb$Use the current Billing / Plan screen in the location dashboard as the source of truth for the location's active plan, available checkout, and billing-management actions because pricing and included features can change.

Some business-growth features can require an active paid plan. The dashboard shows plan state and setup readiness. General plan, feature, and checkout-navigation questions can be handled by automated support.

Refunds, charge disputes, unauthorized charges, payment-method changes, or other protected billing actions require human review.$kb$,
      array['plan','billing','subscription','checkout','location owner','pricing']::text[],
      array['location_owner']::text[],
      true
    ),
    (
      'Why a Business Dashboard Feature Says Upgrade or Setup Is Needed',
      'support-owner-feature-readiness',
      'Understanding plan-locked and setup-dependent business features.',
      $kb$Some location-dashboard features depend on an active business plan, a claimed location, or required setup for that feature. If the dashboard shows Upgrade needed, review Billing / Plan. If it shows missing setup, open the related module and complete the required configuration.

A claimed location is also required for the business workspace. If no claimed location is connected, the dashboard can direct the owner to connect or claim a location first.$kb$,
      array['upgrade needed','setup','plan','claimed location','business dashboard']::text[],
      array['location_owner']::text[],
      false
    ),
    (
      'How Business Dashboard Settings Work',
      'support-owner-settings',
      'Plan state, feature readiness, notifications, and operational settings.',
      $kb$The location dashboard Settings area is used for supported business-workspace configuration and readiness. Separate feature-specific settings also exist inside modules such as Reservations, Messaging, Website, and Notifications.

When troubleshooting a setting, identify the exact dashboard module and setting name. This prevents changing an unrelated business or reservation setting.$kb$,
      array['settings','business dashboard','configuration','readiness']::text[],
      array['location_owner']::text[],
      false
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

with category as (
  select id
  from public.knowledge_base_categories
  where slug = 'support-experience-team'
  limit 1
), internal_articles(title, slug, excerpt, content, tags) as (
  values
    (
      'Support AI Coverage and Handoff Matrix',
      'support-ai-coverage-handoff-matrix',
      'Internal operating rules for knowledge-first support and protected-action escalation.',
      $kb$The automated support assistant should remain first-line for routine product explanation, navigation, setup, and troubleshooting across guest search, accounts, claims, reservations, events, experiences, business profile, menu, website, QR codes, leads, offers, VIP, notifications, reviews, messaging, marketing, promotions, analytics, billing navigation, and ticket status.

Do not escalate simply because the customer needs multiple clarifying questions. Ask one focused question per message and continue until the issue is understood.

Human review is required for refunds/charge disputes, fraud or unauthorized access, legal/safety issues, protected account identity/contact changes, destructive account actions, protected payment changes, ownership transfer/dispute decisions, identity-verification decisions, or an explicit request for a person.

When escalating, preserve the full ticket thread and collect non-sensitive facts that reduce agent work. Never ask for passwords, authentication codes, full card numbers, bank credentials, or SSNs.$kb$,
      array['support','ai','handoff','escalation','coverage','knowledge base']::text[]
    ),
    (
      'Support Product Area Map',
      'support-product-area-map',
      'Internal map of public and location-owner support areas in the current product.',
      $kb$Guest/public areas: search and outing planning, location accuracy, account access, reservations and reservation SMS, events/tickets, experiences/bookings, reviews/feedback, contact form, and support ticket status.

Business-owner areas: claim with code/QR, no-code claim, OTP and ownership review, owner account linking, profile, branding, menu/packages, reservations, website/domains, events/experiences, QR codes, leads, offers, VIP, notifications, reviews/feedback, messaging, Marketing Studio, Promotion Center, analytics, billing/plan, and settings.

Use the public AI-approved articles for customer-facing facts. Internal-only articles can guide staff but must never be surfaced as customer knowledge.$kb$,
      array['support','product map','business dashboard','guest support','owner support']::text[]
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
  internal_articles.title,
  internal_articles.slug,
  internal_articles.excerpt,
  internal_articles.content,
  'published',
  'internal',
  array['superadmin','admin','editor','reviewer','viewer','experience team']::text[],
  'guide',
  internal_articles.tags,
  true,
  true,
  array[]::text[],
  now(),
  now()
from internal_articles
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
  updated_at = now();
