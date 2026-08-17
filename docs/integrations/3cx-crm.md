# 3CX CRM integration

TheOutHaven remains the CRM system of record. 3CX handles calling, caller matching, and call completion events.

## Required environment variables

Set these only in server-side environments. Never expose them with a `NEXT_PUBLIC_` prefix.

```text
THREE_CX_CRM_API_KEY=<random high-entropy secret>
THREE_CX_WEBCLIENT_URL=https://your-3cx-host.example.com
```

`THREE_CX_WEBCLIENT_URL` should be the public 3CX host or Web Client base URL. The CRM call workspace normalizes it to the 3CX Web Client dial route.

## TheOutHaven endpoints

Production base URL: `https://www.theouthaven.com`

### Lookup by phone

```text
GET /api/integrations/3cx/lookup?phone=[Number]&key=<THREE_CX_CRM_API_KEY>
```

Response shape:

```json
{
  "contacts": [
    {
      "id": "location-id",
      "firstName": "Example",
      "lastName": "Venue",
      "company": "Example Venue",
      "email": "owner@example.com",
      "businessPhone": "+15165550123",
      "city": "Queens",
      "state": "NY",
      "profileUrl": "https://www.theouthaven.com/admin/dashboard/crm/location-id?tab=communication"
    }
  ]
}
```

Configure the 3CX CRM Integration Wizard to map the first item in `contacts`:

- Contact ID -> `contacts[0].id`
- First Name -> `contacts[0].firstName`
- Last Name -> `contacts[0].lastName`
- Company Name -> `contacts[0].company`
- Email -> `contacts[0].email`
- Business Phone -> `contacts[0].businessPhone`
- Contact URL -> `contacts[0].profileUrl`

The endpoint first narrows candidates using the final four digits and then performs an exact normalized ten-digit comparison before returning a match.

### Call journaling

```text
POST /api/integrations/3cx/journal?key=<THREE_CX_CRM_API_KEY>
Content-Type: application/json
```

Use the 3CX `ReportCall` scenario and include the matched CRM Contact ID as `locationId` or `contactId`. The endpoint accepts common aliases for call direction, status, duration, caller/callee, agent/extension, and call ID.

Recommended JSON body:

```json
{
  "locationId": "[ContactID]",
  "direction": "[CallDirection]",
  "status": "[CallStatus]",
  "durationSeconds": "[CallDuration]",
  "from": "[CallerNumber]",
  "to": "[Number]",
  "agent": "[Agent]",
  "callId": "[CallID]"
}
```

Map the exact 3CX variables available in the installed V20 template generator. The TheOutHaven endpoint deliberately accepts multiple field aliases so the API contract does not depend on one template-generator label.

Successful journals write a `phone_call` activity with `source_system = 3cx` against the matched CRM location. No new Supabase table is required.

## Click to call

Each location CRM workspace exposes **Related CRM Activity -> Call**. The call page button is labeled **Call** and opens the configured 3CX Web Client directly at its dial route with the location number populated.

The CRM deliberately does not use a generic `tel:` link for this action. Generic telephone links are owned by the operating system and can open FaceTime or another local handler instead of 3CX. If `THREE_CX_WEBCLIENT_URL` is missing or invalid, the call action remains disabled rather than falling back to the device telephone handler.

No 3CX PBX credentials are placed in client-side JavaScript.

## Production verification

1. Add `THREE_CX_CRM_API_KEY` and `THREE_CX_WEBCLIENT_URL` to the production and preview server environments.
2. Deploy the application.
3. Open a CRM location with a phone number and click **Call**. Confirm a new tab opens the 3CX Web Client with the correct number populated and FaceTime is not invoked.
4. In the 3CX CRM Integration Wizard, test lookup with a phone number that exists on a TheOutHaven location.
5. Confirm the returned contact URL opens the correct `/admin/dashboard/crm/<id>` location record when the rep is authenticated.
6. Test a completed outbound call with `ReportCall` enabled.
7. Confirm the CRM location's Call page shows the new 3CX activity.
8. Test inbound caller matching.
9. Test no-match, malformed-number, invalid-secret, and missing-Web-Client-URL cases.
10. Rotate the integration secret before final production launch if it was shared during setup.
