# TheOutHaven Azure infrastructure

Azure infrastructure is managed as Bicep and deployed from GitHub Actions using OIDC.

## Layout

- `main.bicep` - subscription-scoped entrypoint and resource group
- `modules/foundation.bicep` - shared foundation resources
- `parameters/staging.bicepparam` - staging defaults
- `parameters/production.bicepparam` - production defaults

## Validate locally

```bash
az bicep build --file infra/azure/main.bicep
```

## Deploy

Use the **Azure foundation** GitHub Actions workflow after the Azure federated identity is configured. Manual deployment requires selecting the environment and setting `deploy` to `true`.

PR 1 creates no production ingress and changes no DNS.
