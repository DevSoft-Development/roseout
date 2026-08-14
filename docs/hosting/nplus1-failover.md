# N+1 website hosting failover

TheOutHaven generated websites use a primary Lightsail node plus pooled failover capacity.

## Publish path

1. Publish the canonical artifact to the assigned primary node.
2. Replicate the exact published version to a healthy failover node.
3. Record replica node, version, sync timestamp, and status in `website_hosting_replicas`.
4. A primary publish remains successful if standby replication fails; the replica repair cron retries it.

## Recovery path

1. Detect a stale or unhealthy primary heartbeat.
2. Prefer an exact, healthy replica of the current published version.
3. If no exact replica exists, deploy the current artifact to healthy failover capacity as an emergency fallback.
4. Move the website assignment only after a usable failover copy exists.
5. Custom domains use the existing managed domain DNS reconnection path.
6. Platform subdomains use the Vercel-managed `*.theouthaven.com` A record only when the selected failover node has exact replicas for every live platform-domain site. The switch is refused otherwise.

## Capacity rule

Failover capacity is reserved by synced/syncing replica assignments, not only by currently active websites. This prevents the standby pool from being silently overbooked.

## Multi-node note

The shared platform wildcard is intentionally guarded. Until a dedicated hostname-aware routing tier is added, a platform-domain failover node must contain all live platform-domain replicas before the wildcard can move to it. Custom-domain failover remains per website and can use pooled nodes independently.
