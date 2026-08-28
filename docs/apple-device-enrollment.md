# Apple Device Enrollment Console

The admin console at `/admin/dashboard/security/apple-devices` automates the normal Apple Business Manager → Microsoft Intune enrollment handoff for company-owned iPads and iPhones.

## One-time Apple Business API credentials

Create an API account in Apple Business Manager and configure these server-only production environment variables:

- `APPLE_BUSINESS_API_CLIENT_ID`
- `APPLE_BUSINESS_API_KEY_ID`
- `APPLE_BUSINESS_API_PRIVATE_KEY`
- `APPLE_BUSINESS_INTUNE_MDM_SERVER_ID` (optional; if omitted, the console selects the Apple device management service whose name contains `Intune`)

Never expose these values with a `NEXT_PUBLIC_` prefix.

The private key may be stored with literal newlines or escaped `\n` sequences.

## Microsoft permission upgrade

The existing Microsoft 365 integration needs these Intune delegated permissions for automated ADE sync:

- `DeviceManagementManagedDevices.ReadWrite.All`
- `DeviceManagementConfiguration.ReadWrite.All`
- `DeviceManagementServiceConfig.ReadWrite.All`

After deploying the permission change, reconnect Microsoft 365 once so the administrator can grant consent for the added ReadWrite scopes.

## Prepare Device workflow

`Prepare for Intune` performs the following server-side steps:

1. Verifies the selected Apple serial exists in Apple Business Manager.
2. Assigns it to the detected/configured Intune device management service using Apple Business API `POST /v1/orgDeviceActivities` with `ASSIGN_DEVICES`.
3. Triggers the connected Intune Apple enrollment token sync through Microsoft Graph beta.
4. Refreshes the Apple enrollment and managed-device admin pages.

The device still needs to run Apple Setup Assistant (new or erased device) before it becomes a managed Intune device.

## Security

The page and write endpoint require the existing admin `security` permission. Apple API credentials remain server-only. Destructive Intune remote actions are not exposed on this enrollment page.
