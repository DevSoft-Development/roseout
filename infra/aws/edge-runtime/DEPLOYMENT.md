# East edge runtime deployment

The production Edge Runtime deploys in AWS `us-east-1` and remains dormant until the final East cutover.

Deployment prerequisites:

- ECR repository: `theouthaven/edge-runtime`
- Lambda: `toh-production-edge-runtime`
- The ECR repository policy must allow the Lambda service to retrieve image layers for that function.
- `schedule-state.txt` must remain `DISABLED` until the Virginia Supabase project, Storage restore, runtime smoke tests, and production-equivalent QA are complete.

This file intentionally sits under `infra/aws/edge-runtime/` so infrastructure-only updates can trigger a clean runtime deployment after prerequisite changes without enabling schedules.
