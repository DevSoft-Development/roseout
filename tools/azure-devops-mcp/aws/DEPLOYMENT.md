# AWS MCP connector — us-east-1 preparation

**State: NOT DEPLOYED.** The CloudFormation template deploys a 503 placeholder Lambda on purpose. The real handler is not wired to the template. Do not expose or advertise a ChatGPT MCP URL until all gates below pass.

## 1. Azure DevOps upstream identity

In `https://dev.azure.com/TheOutHaven` use **Organization settings → Users** to invite/verify a dedicated Entra-backed service identity for the connector. Give it only appropriate access to the project. In project repositories and pipelines, grant **Read** only and deny write, force push, build queue, resource administration and variable-group secrets.

The user-facing Entra App Registration for ChatGPT access is a separate resource API. Registering that app does **not** automatically provide upstream Azure DevOps rights. Prefer Entra service principal access tokens accepted by Azure DevOps over PATs, and test with read-only calls before provisioning a secret. Token/credential lifecycle, issuer, scope and supported authentication must be certified in the target organization.

## 2. AWS secret

In **AWS Secrets Manager, us-east-1**, provision `theouthaven/integrations/azure-devops/read-only` with JSON shape `{"token":"<secure short-lived read-only upstream credential>"}` **in the AWS console only**. Never paste a real credential into GitHub, YAML, or ChatGPT. Record the returned secret ARN for the CloudFormation parameter. Current handler accepts a token for Azure DevOps Basic/PAT authentication; Entra service principal OAuth requires replacing this with Bearer token support and managed rotation before activation. Avoid issuing a standing human PAT.

## 3. Build and deployment readiness

1. Run protocol tests and negative auth tests.
2. Build a Lambda zip containing `handler.mjs`, its Node dependency and lockfile; modify CloudFormation `Code` to reference an immutable S3 artifact.
3. Deploy in `us-east-1` via reviewed CloudFormation change set, supplying **EntraTenantId**, **EntraClientId**, and **AzureDevOpsSecretArn** parameters from trusted configuration.
4. Verify the API Gateway route is bound to its JWT authorizer and unauthorized requests fail before invoking Lambda.
5. Add OAuth protected-resource discovery and ChatGPT OAuth authorization-client compatibility.
6. Audit access, enforce allowlisted users, rate limits, payload/response caps; perform real Azure read test and permission-denial tests.
7. Only after certification, enable Lambda handler and connect ChatGPT using the verified HTTPS URL.

## 4. Security reminders

- Do not create or share client secrets in chat.
- MCP access is not secure merely because `devops.read` exists; signed-token validation, issuer, audience, tenant, user scope and resource permissions must all pass.
- Hosted ChatGPT connector needs OAuth-compatible discovery; this is **not yet** implemented.
- Do not create an AWS deployment from the current template expecting a working remote MCP server.
