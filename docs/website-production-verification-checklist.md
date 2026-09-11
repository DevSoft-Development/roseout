# Website Production Verification Checklist

This checklist defines the release gate for hosted websites without creating a second hosting, registrar, or scheduler path.

## 1. Published website
- Published version exists.
- `last_publish_status=published`.
- `status=live` and `deployment_status=deployed`.
- Customer-facing publish errors appear only when the publish itself failed.

## 2. Hosting redundancy
- Primary Lightsail node is healthy with a recent heartbeat.
- Exact published version is present on the primary node.
- Exact published version is synced to a healthy standby replica.
- Standby repair is treated as an operations warning, not a failed customer publish.

## 3. Website address paths
### TheOutHaven subdomain
- `platform_domain` assigned.
- Managed wildcard HTTPS path available.
- No customer DNS action required.

### Customer-owned domain
- Domain attached to the existing website record.
- DNS verified/configured.
- SSL active before cutover is considered complete.

### Essentials first-year domain via OpenSRS
- Domain gateway authenticated.
- Registration enabled.
- DNS changes enabled.
- Registration is idempotent and persisted before connection.
- Domain attaches to the existing hosted website.
- DNS and SSL continue through the existing domain lifecycle job.
- Renewal date is persisted and shown separately from the included first year.

## 4. Migration providers
Regression fixtures cover WordPress, Wix, Squarespace, Toast, BentoBox, Popmenu, and generic/static sites. Import review must expose provider signals, pages, assets, forms, booking links, downloads, redirects, and migration exceptions.

## 5. Migration review
- Blocking items cannot be bypassed.
- Reservation provider can be confirmed.
- Old URL redirects can be remapped.
- PDF-only menu handling can be acknowledged.
- Forms and external assets can be reviewed.
- Resolved items no longer appear as unresolved.

## 6. Premium design QA
- 40 design families remain available.
- Every family has a composition profile.
- Structural diversity is checked across hero, navigation, page order, reservation placement, image ratio, radius, and section treatment.
- Owner Preview supports desktop, iPad/tablet, and phone widths.

## 7. Operations
Existing Website Hosting operations should surface:
- publish failures
- primary-node failures
- missing/stale standby replicas
- stale health checks
- DNS or SSL failures
- OpenSRS connection or renewal issues
- migration review backlog
- broken live sites or booking links

The existing website failover, replica repair, and domain lifecycle jobs remain the automation layer. Do not add a new scheduler for these checks.
