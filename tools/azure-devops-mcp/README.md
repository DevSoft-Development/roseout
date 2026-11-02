# Azure DevOps MCP bridge — bootstrap

A minimal **read-only** MCP stdio server for TheOutHaven LLC. The bridge is intentionally not deployed or connected to ChatGPT yet. No external listener, write operation, production authority, or secret is introduced by this PR.

## Configuration

Requires Node.js 22+ and a least-privilege Azure DevOps service credential with **Build (Read)** and **Code (Read)** only. Store the credential in a secrets manager, **never in the repo or chat**.

- `AZDO_ORGANIZATION=TheOutHaven`
- `AZDO_PROJECT=TheOutHaven`
- `AZDO_REPOSITORY=TheOutHaven`
- `AZDO_MCP_TOKEN` — a short-lived, read-only token supplied by the secure runtime

Run `node tools/azure-devops-mcp/server.mjs` as the executable of an MCP stdio client. Inspecting these files or merging the PR does not connect ChatGPT to this service.

Exposed tools: `list_pipelines`, `list_builds`, `get_build`, and `list_branches`.

## Next gates

1. Verify token scope and use organization-managed credential rotation.
2. Add protocol integration tests and explicit output paging/size limits.
3. Host an authenticated remote MCP transport only after network/auth review; stdio alone cannot be connected directly from this chat.
4. Add repository/CI write tools separately with explicit per-operation authorization, audit logs and production restrictions.
5. Before retiring GitHub, certify selective CI and AWS/Azure deployment rollback.
