# AWS MCP connector — us-east-1 preparation

**State: NOT DEPLOYED.** The CloudFormation template references an immutable S3 Lambda ZIP, but has no active API Gateway stage and has the default execute-api endpoint disabled. OAuth discovery and authorization are incomplete. Do not expose or advertise a ChatGPT MCP URL until all gates below pass.

## 1. Azure DevOps upstream identity

In `https://dev.azure.com/TheOutHaven` use **Organization settings → Users** to invite/verify a dedicated Entra-backed service identity for the connector. Give it only appropriate access to the project. In project repositories and pipelines, grant **Read** only and deny write, force push, build queue, resource administration and variable-group secrets.

The user-facing Entra App Registration for ChatGPT access is a separate resource API. Registering that app does **not** automatically provide upstream Azure DevOps rights. Prefer Entra service principal access tokens accepted by Azure DevOps over PATs, and test with read-only calls before provisioning a secret. Token/credential lifecycle, issuer, scope and supported authentication must be certified in the target organization.

## 2. AWS secret

The existing AWS Secrets Manager certificate secret holds the PEM private key as its **plaintext secret value**. The Lambda handler now constructs a signed Entra client assertion and requests a short-lived **Bearer** token for Azure DevOps. Supply only the secret ARN as the stack parameter. Never copy the private key into GitHub, YAML, or chat. Certificate-based token exchange still needs real-world integration testing.

## 3. Build and deployment readiness

1. Run `node --test tools/azure-devops-mcp/aws/handler.test.mjs` and certificate-exchange integration tests in an isolated runtime.
2. Build a Lambda zip with `bash tools/azure-devops-mcp/aws/build-package.sh`. Upload the reviewed ZIP to a private versioned S3 object; supply the bucket/key parameters already in CloudFormation. Do not use an unreviewed artifact.
3. Deploy in `us-east-1` via reviewed CloudFormation change set, supplying **EntraTenantId**, **EntraClientId**, and **AzureDevOpsSecretArn** parameters from trusted configuration.
4. Verify the API Gateway route is bound to its JWT authorizer and unauthorized requests fail before invoking Lambda.
5. Add OAuth protected-resource discovery and ChatGPT OAuth authorization-client compatibility.
6. Audit access, enforce allowlisted users, rate limits, payload/response caps; perform real Azure read test and permission-denial tests.
7. Only after certification, add a reviewed API Gateway stage and enable the endpoint, then connect ChatGPT using the verified HTTPS URL.

## 4. Security reminders

- Do not create or share client secrets in chat.
- MCP access is not secure merely because `devops.read` exists; signed-token validation, issuer, audience, tenant, user scope and resource permissions must all pass.
- Hosted ChatGPT connector needs OAuth-compatible discovery; this is **not yet** implemented.
- Do not create an AWS deployment from the current template expecting a working remote MCP server.
