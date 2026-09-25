# TheOutHaven canonical platform ownership

Status: canonical target architecture

This document is the source of truth for platform ownership during and after the Azure consumer migration. If an older roadmap conflicts with this document, this document wins.

## Ownership

| Capability | Canonical owner |
| --- | --- |
| Consumer web and synchronous consumer API | Azure |
| Consumer regional DR | Azure |
| Global consumer ingress, TLS, WAF | Azure Front Door |
| Consumer container registry | Azure Container Registry |
| Primary AI and embeddings | Microsoft Foundry / Azure AI |
| Full AI fallback | Hugging Face through the TheOutHaven AI gateway |
| iOS and Android application framework | React Native |
| Mobile build and store submission automation | Azure Pipelines target state |
| OTA update hosting and control plane | Azure target state |
| PostgreSQL, Auth, RLS, Realtime, Storage | Supabase |
| Database DR | Supabase Virginia primary / Oregon controlled DR |
| Admin | AWS |
| Business | AWS |
| Reserve | AWS |
| Canonical recurring scheduler | AWS EventBridge Scheduler |
| Async queues and DLQs | AWS SQS |
| Background execution | AWS Lambda / Fargate |
| Independent backups | AWS S3 |
| Generated customer websites | AWS S3 + CloudFront |
| Bulk/background email | AWS SES |
| Authoritative TheOutHaven DNS zones | AWS Route 53 |
| Telecom delivery | Telnyx/Twilio as required |
| Payments | Stripe |
| Location intelligence | Google Places/Maps |
| Bot protection | Cloudflare Turnstile |
| Source, PRs, CI orchestration | GitHub |

## DNS

Route 53 remains authoritative for TheOutHaven-owned zones. Records may target different clouds:

```text
theouthaven.com          -> Azure Front Door
www.theouthaven.com      -> Azure Front Door
updates.theouthaven.com  -> Azure Front Door
admin.theouthaven.com    -> AWS
business.theouthaven.com -> AWS
reserve.theouthaven.com  -> AWS
```

## Consumer failure domains

```text
Users
  |
Azure Front Door
  |
  +--> Azure primary region
  |
  +--> Azure secondary region
          |
          v
       Supabase
```

Azure regional failover does not automatically promote the Supabase Oregon DR environment. Database DR remains an explicit controlled process.

## AI failure domain

```text
Application
   |
TheOutHaven AI Gateway
   |
   +--> Azure AI (primary)
   |
   +--> Hugging Face (fallback)
```

Applications should call the internal gateway rather than provider APIs directly. Provider-specific credentials and request formats must remain behind adapters.

## Scheduling invariant

AWS EventBridge is the only recurring business scheduler. Azure may run synchronous consumer workloads and event-driven consumers, but it must not become a second recurring scheduler fleet.

## Migration state

Vercel and EAS hosted services are migration sources, not target-state owners. They are removed only after equivalent Azure paths pass staging, production canary, rollback, and DR verification.
