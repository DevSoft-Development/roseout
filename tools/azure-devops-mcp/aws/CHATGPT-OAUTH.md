# ChatGPT OAuth activation gates — TheOutHaven MCP

Status: **ACTIVE — read-only production MCP integration certified October 20, 2026**. ChatGPT OAuth and discovery are working. Four tools (`list_pipelines`, `list_builds`, `get_build`, `list_branches`) have been successfully called against live Azure DevOps.

The existing Entra App Registration (`TheOutHaven DevOps Connector`) is the **resource API and upstream service identity**, not automatically a ChatGPT OAuth client registration. ChatGPT needs an OAuth client recognized by Microsoft Entra. Do not reuse the certificate client assertion for ChatGPT sign-in. Plan a separate Entra public-client registration (or supported confidential-client flow), grant the resource's delegated `devops.read` scope, set the redirect URI shown in ChatGPT plugin creation, and verify PKCE/refresh-token behavior. Static client registration must follow current ChatGPT MCP connector requirements.

MCP protected-resource metadata is exposed by a dedicated unauthenticated `GET /.well-known/oauth-protected-resource` route, and API Gateway has an active `$default` stage with JWT protection on `POST /api/mcp`. `MCP_RESOURCE_URL` must be set to the exact deployed HTTPS origin before activation; never set it to an unverified URL.

The Entra identity provider is expected at `https://login.microsoftonline.com/<tenant>/v2.0`. Confirm discovery metadata, support for OAuth auth-code + PKCE and expected audience for the API's delegated access tokens. Production v2 delegated tokens use the resource app GUID as `aud`; the authorizer explicitly accepts the GUID and `api://` URI, and the handler enforces the same approved audience set. Never broaden to unrelated audiences. Test that a token intended for Azure DevOps is rejected by the MCP resource.

## Original release gates and continuing hardening requirements

1. On every change, build current handler, run tests, and publish a new immutable S3 version. Verify source commit and SHA256 match the reviewed release.
2. Test Entra delegated access tokens and ChatGPT OAuth client registration in an isolated stage; never bypass the JWT authorizer.
3. Enforce an individual-user allowlist/group restriction for the resource endpoint; a valid `devops.read` scope alone may not identify an authorized operator.
4. Ensure the Microsoft Entra refresh-token path works or document required reauthentication.
5. Configure a verified HTTPS hostname, `MCP_RESOURCE_URL`, and GET discovery + protected POST route together. Perform 401/403 and positive MCP tool tests.
6. Review CloudFormation change set; enable the API Gateway stage only after these checks pass.
7. Add as a draft custom MCP plugin in ChatGPT, scan tools, authorize and test the read-only tools; publish only with owner approval.

References:
https://developers.openai.com/plugins/build/auth
https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt

## Production status and remaining constraints

The user-facing OAuth application is a separate confidential-client registration. API Gateway's protected route requires a Microsoft Entra v2 JWT with `devops.read` delegated permission, and the Lambda enforces tenant, audience, and scope; the upstream Entra service identity is limited to Azure DevOps reads. The endpoint was certified with a real ChatGPT connection on 2026-10-20. Maintain the explicit `EnablePublicEndpoint=true` stack parameter when updating the already-active stack. For any new stack, the default remains disabled.

Before granting write operations or additional workspace-wide access, implement and test explicit operator allowlisting, rate limits, audit logging, and bounded output sizes. Keep existing access read-only until reviewed.
