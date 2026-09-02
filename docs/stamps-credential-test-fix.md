# Stamps.com credential test fix

Production investigation confirmed:

- the Superadmin Credentials Vault successfully stores the Stamps.com `integrationId`, `username`, and `password` fields;
- the AWS Integration API reaches the approved production SWS/IM v160 endpoint;
- the non-transactional `GetAccountInfo` call returns a Stamps.com SOAP fault with the safe message `Authentication failed.`;
- the saved value in the Stamps.com username field has email-address shape;
- no postage purchase operation was invoked during diagnosis.

The admin vault now labels the field as the Stamps API/partner username and explains where to retrieve it. The credential Test action also surfaces a safe, actionable authentication message instead of collapsing the failure to `credential_vault_request_failed`.

No credential values, SOAP bodies, Authenticators, or Integration ID values are stored in this document.
