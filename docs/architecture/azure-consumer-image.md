# Azure consumer container image

The consumer runtime is packaged as a dedicated immutable container image for Azure Container Apps.

- Build source: `apps/consumer`
- Dockerfile: `infra/azure/consumer-runtime/Dockerfile`
- Registry: staging Azure Container Registry
- Image tag: full Git commit SHA
- Runtime port: 3000
- Health endpoint: `/api/health/azure`

Pull requests build the image with non-secret placeholder configuration to prove the container is reproducible.

Manual staging pushes require the staging GitHub environment to provide:

- `NEXT_PUBLIC_SITE_URL` as an environment variable
- `NEXT_PUBLIC_SUPABASE_URL` as an environment variable
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` as an environment secret

Server-only credentials are not baked into the image. They will be attached to the Container App runtime through Azure Key Vault / managed runtime configuration in the deployment slice.

Production image pushing and traffic cutover remain disabled.
