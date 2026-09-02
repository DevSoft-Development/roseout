# Stamps.com production safety gate

- Production SWS/IM calls run only inside the AWS Integration API.
- Vercel keeps staging-only direct SOAP support and fails closed for live SOAP.
- The AWS credential-vault entry remains authoritative for production credentials.
- `livePurchasesEnabled` defaults to `false` when absent and is read from Secrets Manager on every invocation so the kill switch is immediate.
- The controlled proof reserves `IntegratorTxId` in Supabase before AWS is called.
- `CreateMailingLabelIndicia` is attempted exactly once; ambiguous failures are manual-review events and are never blindly retried.
- A known purchase is persisted before indicium image processing.
- The print center renders live postage only for the exact item persisted as purchased and only when its saved production indicium exists.
- Bulk production postage remains outside this change and must stay locked until the one-card physical 4x6 layout is verified.
