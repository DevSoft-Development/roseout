# TheOutHaven LLC - authenticated Azure DevOps remote MCP rollout

Status: **design gate only; NOT hosted, reachable or authorized yet**.

## Boundary

The existing prototype at `tools/azure-devops-mcp/server.mjs` (PR #4257) is a local stdio MCP server, not a remote endpoint. Do not point ChatGPT to a raw HTTP wrapper around stdio, expose `AZDO_MCP_TOKEN`, or deploy without user authorization.

## Deployment target

- Dedicated **AWS API Gateway HTTP API + AWS Lambda** stack (`theouthaven-azure-devops-mcp`) isolated from Consumer/Admin production apps.
- Standalone Streamable HTTP MCP endpoint at `/api/mcp`.
- No anonymous access. Every MCP request requires a verified audience-bound Microsoft Entra access token with user identity and approved read scopes.
- Provide OAuth protected-resource metadata at `/.well-known/oauth-protected-resource` and a discoverable authorization server as required by ChatGPT custom MCP OAuth.
- Validate JWT signature against Entra JWKS, exact issuer, audience, expiry, scopes and tenant; never merely decode token.
- Use a trusted MCP HTTP SDK/handler for protocol support, request isolation and origin validation. No homegrown bearer parsing as a substitute for OAuth.

## Credentials

- Use an Entra app registration for the MCP **resource API**, tenant-restricted, with admin approved delegated read-only scope (`devops.read`).
- The MCP's upstream Azure DevOps identity is separately authorized with **Code Read** and **Build Read**; use a managed identity/service principal where supported, else a short-lived least-privilege token in a managed vault. Never ship an operator PAT to frontend or Git.
- Host upstream credentials only in AWS Secrets Manager (or a tightly scoped external vault), loaded by a dedicated Lambda role.
- No persistent user tokens, authorization codes, or access-token values in logs.
- Auth errors: fail closed with 401/403 before invoking any Azure DevOps API.

## Initial tools and permissions

- `list_pipelines` - Build Read
- `list_builds` - Build Read
- `get_build` - Build Read
- `list_branches` - Code Read

No branch/file writes, PR merge, pipeline run, secret reads, or deployment actions in V1. Write capabilities must be independently reviewed, scoped, audited, and user-confirmed.

## Certification gates before publishing to ChatGPT

1. Prove anonymous requests get 401 and RFC-compliant OAuth discovery information; invalid issuer/audience/tenant/expired tokens rejected.
2. Authenticate as the intended Entra user and call each read-only MCP tool with tenant/project restrictions.
3. Verify no token or private repository content appears in public logs/error responses.
4. Confirm AWS API Gateway/Lambda isolation, throttling, request timeouts, concurrency limits, and CloudWatch monitoring.
5. Install as a **draft custom MCP plugin** in ChatGPT workspace. Test only authorized read tools, then explicitly approve publishing.
6. Require separate explicit authorization before enabling any future write operations.

## User-owned one-time setup

1. Approve the MCP app registration in the correct Microsoft Entra tenant; record tenant ID and app/client ID in the secure deployment settings (not a chat message if sensitive).
2. Grant only the delegated read scope and admin consent as appropriate; arrange an upstream DevOps service identity.
3. Authorize the dedicated AWS API Gateway endpoint/domain and deploy role.
4. In ChatGPT: Plugins > Add custom MCP server; enter the verified HTTPS URL; complete OAuth and review permissions.

Official references:
- https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
- https://developers.openai.com/plugins/build/auth
- https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-jwt-authorizer.html

## Migration order

First read-only access and audit, then scoped PR creation, then on-demand CI, then production controls only after rollback/approval gates. The existing GitHub-to-Azure sync and TheOutHaven-CI remain separate and unchanged.
