# ChatGPT OAuth activation gates — TheOutHaven MCP

Status: **NOT ACTIVE**. This document is an activation plan, not proof of integration.

The existing Entra App Registration (`TheOutHaven DevOps Connector`) is the **resource API and upstream service identity**, not automatically a ChatGPT OAuth client registration. ChatGPT needs an OAuth client recognized by Microsoft Entra. Do not reuse the certificate client assertion for ChatGPT sign-in. Plan a separate Entra public-client registration (or supported confidential-client flow), grant the resource's delegated `devops.read` scope, set the redirect URI shown in ChatGPT plugin creation, and verify PKCE/refresh-token behavior. Static client registration must follow current ChatGPT MCP connector requirements.

MCP protected-resource metadata is exposed by a dedicated unauthenticated `GET /.well-known/oauth-protected-resource` route, but API Gateway is intentionally **disabled** and no stage exists. `MCP_RESOURCE_URL` must be set to the exact deployed HTTPS origin before activation; never set it to an unverified URL.

The Entra identity provider is expected at `https://login.microsoftonline.com/<tenant>/v2.0`. Confirm discovery metadata, support for OAuth auth-code + PKCE and expected audience for the API's delegated access tokens. The resource application identifier may be `api://<resource-client-id>`, not the bare GUID; align the JWT authorizer's Audience and the handler's `aud` check with tokens actually issued in production. Test that a token intended for Azure DevOps is rejected by the MCP resource.

## Required release gates

1. Build current handler (with discovery changes), run tests and publish a new immutable S3 version. The existing `lambda-7ca44a32.zip` does **not** contain these changes.
2. Test Entra delegated access tokens and ChatGPT OAuth client registration in an isolated stage; never bypass the JWT authorizer.
3. Enforce an individual-user allowlist/group restriction for the resource endpoint; a valid `devops.read` scope alone may not identify an authorized operator.
4. Ensure the Microsoft Entra refresh-token path works or document required reauthentication.
5. Configure a verified HTTPS hostname, `MCP_RESOURCE_URL`, and GET discovery + protected POST route together. Perform 401/403 and positive MCP tool tests.
6. Review CloudFormation change set; enable the API Gateway stage only after these checks pass.
7. Add as a draft custom MCP plugin in ChatGPT, scan tools, authorize and test the read-only tools; publish only with owner approval.

References:
https://developers.openai.com/plugins/build/auth
https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt
