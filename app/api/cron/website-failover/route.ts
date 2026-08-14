import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectGeneratedSiteDomain } from "@/lib/domains/connect-generated-site";
import { switchPlatformWildcardToNode } from "@/lib/domains/vercel-wildcard-failover";
import { failoverWebsiteToHealthyNode } from "@/lib/hosting/lightsail-failover";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 20;
const NODE_HEALTH_MAX_AGE_MS = 10 * 60 * 1000;

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
    recoveredRouting: results.filter((item) => item.state === "routing_recovered").length,
    retrying: results.filter((item) => item.state === "failover_retry" || item.state === "routing_retry").length,
    results,
  });
}
