import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectGeneratedSiteDomain } from "@/lib/domains/connect-generated-site";
import { switchPlatformWildcardToNode } from "@/lib/domains/vercel-wildcard-failover";
import { failoverWebsiteToHealthyNode } from "@/lib/hosting/lightsail-failover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 20;
const NODE_HEALTH_MAX_AGE_MS = 10 * 60 * 1000;
const AUTO_FAILBACK_STABILITY_MS = 15 * 60 * 1000;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function healthIsFresh(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() - NODE_HEALTH_MAX_AGE_MS;
}

function healthIsSustained(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now() - AUTO_FAILBACK_STABILITY_MS;
}

async function finishRouting(
  website: {
    id: string;
    location_id: string;
    domain: string | null;
    platform_domain: string | null;
  },
  node: { id: string; public_ip: string },
) {
  const customDomain = String(website.domain || "").trim().toLowerCase();
  const platformDomain = String(website.platform_domain || "").trim().toLowerCase();

  if (customDomain) {
    await connectGeneratedSiteDomain(String(website.location_id), customDomain);
  } else if (platformDomain) {
    await switchPlatformWildcardToNode(node.id, node.public_ip);
  } else {
    throw new Error("website_domain_missing");
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("business_websites")
    .update({
      deployment_status: "deployed",
      status: customDomain ? "provisioning" : "live",
      last_deployed_at: now,
      last_error: null,
      updated_at: now,
    })
    .eq("id", website.id);

  if (customDomain) {
    await supabaseAdmin
      .from("locations")
      .update({
        included_domain_connection_status: "awaiting_dns",
        included_domain_verification_checked_at: now,
        updated_at: now,
      })
      .eq("id", website.location_id);
  }

  return { customDomain, platformDomain };
}

async function tryAutomaticFailback(website: {
  id: string;
  location_id: string;
  domain: string | null;
  platform_domain: string | null;
  hosting_node_id: string | null;
  failover_source_node_id: string | null;
  published_version: number | null;
}) {
  const sourceNodeId = String(website.failover_source_node_id || "");
  if (!sourceNodeId || !website.platform_domain || sourceNodeId === String(website.hosting_node_id || "")) {
    return null;
  }

  const { data: sourceNode, error: sourceError } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,name,status,public_ip,last_health_check_at,healthy_since")
    .eq("id", sourceNodeId)
    .maybeSingle();

  if (sourceError || !sourceNode) {
    return { state: "failback_source_unavailable" as const };
  }

  if (
    sourceNode.status !== "healthy"
    || !sourceNode.public_ip
    || !healthIsFresh(sourceNode.last_health_check_at)
  ) {
    return { state: "failback_waiting_primary" as const, node: sourceNode.name };
  }

  if (!healthIsSustained(sourceNode.healthy_since)) {
    return { state: "failback_stabilizing" as const, node: sourceNode.name, healthySince: sourceNode.healthy_since };
  }

  const version = Number(website.published_version || 0);
  const { data: replica, error: replicaError } = await supabaseAdmin
    .from("website_hosting_replicas")
    .select("version,status")
    .eq("website_id", website.id)
    .eq("node_id", sourceNode.id)
    .maybeSingle();

  if (replicaError || !replica || replica.status !== "synced" || Number(replica.version) !== version) {
    return { state: "failback_waiting_replica" as const, node: sourceNode.name, version };
  }

  try {
    const routing = await switchPlatformWildcardToNode(sourceNode.id, String(sourceNode.public_ip));
    const now = new Date().toISOString();
    const { error: updateError } = await supabaseAdmin
      .from("business_websites")
      .update({
        hosting_node_id: sourceNode.id,
        failover_source_node_id: null,
        status: "live",
        deployment_status: "deployed",
        last_error: null,
        last_deployed_at: now,
        updated_at: now,
      })
      .eq("id", website.id);

    if (updateError) {
      return { state: "failback_state_retry" as const, node: sourceNode.name, version, routingChanged: routing.changed };
    }

    return { state: "failed_back" as const, node: sourceNode.name, version, routingChanged: routing.changed };
  } catch (failbackError) {
    return {
      state: "failback_retry" as const,
      node: sourceNode.name,
      version,
      error: failbackError instanceof Error ? failbackError.message : "automatic_failback_failed",
    };
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: websites, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,domain,platform_domain,hosting_node_id,status,deployment_status,failover_source_node_id,published_version")
    .in("status", ["live", "deploying"])
    .not("hosting_node_id", "is", null)
    .order("last_health_check_at", { ascending: true, nullsFirst: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("Website failover queue lookup failed", error);
    return NextResponse.json({ ok: false, error: "Unable to load website failover queue." }, { status: 500 });
  }

  const results: Array<Record<string, unknown>> = [];
  for (const website of websites || []) {
    if (website.failover_source_node_id) {
      const failback = await tryAutomaticFailback(website);
      if (failback) {
        results.push({ websiteId: website.id, locationId: website.location_id, ...failback });
        if (failback.state === "failed_back") continue;
      }
    }

    const nodeId = String(website.hosting_node_id || "");
    const { data: node, error: nodeError } = await supabaseAdmin
      .from("website_hosting_nodes")
      .select("id,name,status,last_health_check_at,public_ip")
      .eq("id", nodeId)
      .maybeSingle();

    if (nodeError) {
      results.push({ websiteId: website.id, state: "node_read_error" });
      continue;
    }

    const healthy = Boolean(node && node.status === "healthy" && healthIsFresh(node.last_health_check_at) && node.public_ip);
    const isRoutingRecovery = website.status === "deploying" && Boolean(website.failover_source_node_id) && healthy;

    if (isRoutingRecovery && node) {
      try {
        const routing = await finishRouting(website, { id: node.id, public_ip: node.public_ip });
        results.push({
          websiteId: website.id,
          locationId: website.location_id,
          domainType: routing.customDomain ? "custom" : "platform",
          state: "routing_recovered",
          node: node.name,
          version: Number(website.published_version || 0),
        });
      } catch (routingError) {
        const message = routingError instanceof Error ? routingError.message : "website_routing_recovery_failed";
        await supabaseAdmin
          .from("business_websites")
          .update({
            deployment_status: "failed",
            last_error: `routing_retry_failed:${message}`.slice(0, 500),
            updated_at: new Date().toISOString(),
          })
          .eq("id", website.id);
        results.push({ websiteId: website.id, state: "routing_retry", error: message });
      }
      continue;
    }

    const unhealthy = !healthy;
    if (!unhealthy) {
      results.push({ websiteId: website.id, state: website.status === "live" ? "healthy" : "deploying", node: node?.name });
      continue;
    }

    try {
      const recovery = await failoverWebsiteToHealthyNode(String(website.location_id));
      const routing = await finishRouting(website, { id: recovery.node.id, public_ip: recovery.node.public_ip });

      results.push({
        websiteId: website.id,
        locationId: website.location_id,
        domainType: routing.customDomain ? "custom" : "platform",
        state: "failed_over",
        fromNode: node?.name || nodeId,
        toNode: recovery.node.name,
        version: recovery.version,
        recoveryMode: recovery.recoveryMode,
      });
    } catch (failoverError) {
      const message = failoverError instanceof Error ? failoverError.message : "website_failover_failed";
      await supabaseAdmin
        .from("business_websites")
        .update({
          deployment_status: "failed",
          last_error: message.slice(0, 500),
          updated_at: new Date().toISOString(),
        })
        .eq("id", website.id);
      results.push({ websiteId: website.id, state: "failover_retry", error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    failedOver: results.filter((item) => item.state === "failed_over").length,
    failedBack: results.filter((item) => item.state === "failed_back").length,
    recoveredRouting: results.filter((item) => item.state === "routing_recovered").length,
    retrying: results.filter((item) => item.state === "failover_retry" || item.state === "routing_retry" || item.state === "failback_retry" || item.state === "failback_state_retry").length,
    results,
  });
}
