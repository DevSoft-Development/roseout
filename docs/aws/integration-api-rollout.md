# TheOutHaven Integration API rollout

TheOutHaven server-side API traffic is being split by workload so Vercel remains primarily the Next.js web/BFF layer.

## Service boundaries

- **Core API**: CRM, contacts/customers, schedules/reservations, settings, subscriptions, events/experiences. Core extraction follows after the Integration API rollout.
- **AI/Search API**: already isolated on AWS App Runner through the search ML service.
- **Integration API**: this stack owns synchronous third-party provider calls that should not execute inside the Vercel application runtime.
- **Async operations**: already isolated through the AWS platform job gateway, SQS, Lambda/ECS, and EventBridge.

## First migrated provider

Microsoft Graph is the first provider routed through the dedicated Integration API.

The browser-facing Next.js routes do not change. `lib/microsoft-365/graph.ts` still owns user connection lookup and token refresh. When `AWS_PLATFORM_INTEGRATION_API_URL` is configured, the actual Microsoft Graph HTTP request is sent through AWS instead of being executed by Vercel.

The rollout is intentionally fail-open during migration:

- Integration API healthy: Graph request executes from AWS.
- Integration API unavailable or returns 5xx: the existing direct Graph request path is used.
- Graph 4xx/429 responses are returned normally and are not duplicated through the fallback path.

## Authentication

The Integration API uses the same timestamped HMAC request format as the existing AWS platform job gateway.

Production may use a dedicated `AWS_PLATFORM_INTEGRATION_API_SECRET`. During the initial rollout, the application client and deployment workflow can fall back to the already-provisioned `AWS_PLATFORM_JOB_GATEWAY_SECRET`. This avoids adding a launch-blocking secret handoff. A dedicated integration secret can be rotated in later without changing the API contract.

## Required application configuration

Server-only values:

- `AWS_PLATFORM_INTEGRATION_API_URL`: Lambda Function URL output from the `theouthaven-integration-api-production` stack.
- `AWS_PLATFORM_INTEGRATION_API_SECRET`: optional dedicated HMAC secret. If omitted, `AWS_PLATFORM_JOB_GATEWAY_SECRET` is used.

Never expose either value with a `NEXT_PUBLIC_` prefix.

## Safety constraints

The Microsoft Graph proxy:

- accepts only `graph.microsoft.com` paths;
- accepts only `v1.0` and `beta` Graph versions;
- accepts only GET/POST/PUT/PATCH/DELETE upstream methods;
- forwards only an explicit header allowlist;
- caps request and response sizes;
- uses a bounded upstream timeout;
- never logs the Microsoft access token or request body;
- requires a valid timestamped HMAC signature for every request.

## Deployment

`.github/workflows/aws-integration-api.yml` performs:

1. Python syntax validation.
2. CloudFormation linting.
3. CloudFormation stack deployment on `main`.
4. Lambda code deployment.
5. An authenticated `/v1/status` smoke test.

After the production stack is healthy, set `AWS_PLATFORM_INTEGRATION_API_URL` in the Vercel production environment and redeploy the web application. No public route or OAuth callback URL changes are required.

## Next extraction

After Microsoft Graph traffic is verified through AWS, move Google and other synchronous third-party provider calls behind the same Integration API by adding explicit provider operations. Then begin the Core API extraction, starting with low-risk read-heavy CRM/settings endpoints before write-heavy transactional workflows.
