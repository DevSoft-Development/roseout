# 3CX CRM integration

TheOutHaven remains the CRM system of record. 3CX handles calling, caller matching, and call completion events.

## Required environment variables

Set this only in server-side environments. Never expose it with a `NEXT_PUBLIC_` prefix.

```text
THREE_CX_CRM_API_KEY=<random high-entropy secret>
```

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

Each location CRM workspace exposes **Related CRM Activity -> Call**. The call page button is labeled **Call** and uses a standard `tel:` link so the current device can hand the number to its configured calling application without navigating away from the CRM workspace.

For TheOutHaven staff using 3CX PRO, configure 3CX as the device's default calling application where the operating system supports that choice. On current macOS, the system's **Default for calls** setting applies to phone-number links. On mobile devices, the operating system determines which installed calling application handles the link.

The browser cannot securely force a specific installed native application. If 3CX is not selected as the device's calling handler, the operating system may use another app such as Apple Phone/FaceTime or the carrier dialer.

The server-side 3CX lookup and call-journaling integration remains unchanged and no PBX credentials are exposed in client-side JavaScript.

## Production verification

1. Add `THREE_CX_CRM_API_KEY` to the production and preview server environments.
2. Deploy the application.
3. Install and provision the 3CX app on each work device.
4. Where available, set 3CX as the device's default calling app for phone-number links.
5. Open a CRM location with a phone number and click **Call**. Confirm the CRM page remains open and the configured calling app receives the correct number.
6. In the 3CX CRM Integration Wizard, test lookup with a phone number that exists on a TheOutHaven location.
7. Confirm the returned contact URL opens the correct `/admin/dashboard/crm/<id>` location record when the rep is authenticated.
8. Test a completed outbound call with `ReportCall` enabled.
9. Confirm the CRM location's Call page shows the new 3CX activity.
10. Test inbound caller matching and no-match/malformed-number/invalid-secret cases.
11. Rotate the integration secret before final production launch if it was shared during setup.
