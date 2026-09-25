# Azure AI model readiness

This workflow checks the live Azure subscription before TheOutHaven creates a model deployment.

Use **Azure AI model readiness** in GitHub Actions and choose:

- environment: `staging` first
- model: the candidate deployment model, initially `gpt-5.4-mini`

The workflow authenticates through the existing GitHub OIDC trust and reports:

- the deployed Foundry/AIServices account
- the Foundry region
- models Azure reports as available to that account
- regional Cognitive Services quota/usage lines
- raw JSON evidence as a short-lived workflow artifact

The readiness gate is intentionally separate from model deployment. Model availability and quota are subscription- and region-dependent, so a deployment should not be hard-coded until the live account confirms the candidate model and available capacity.

Current migration rule:

1. Deploy the Azure foundation to staging.
2. Run this readiness workflow against staging.
3. Select the model/version/SKU from live Azure results.
4. Add the model deployment to Bicep.
5. Validate the gateway against staging.
6. Repeat for production only after staging passes.

This does not change production AI traffic, Search V2 embedding ownership, AWS scheduling, Supabase, DNS, or Vercel.
