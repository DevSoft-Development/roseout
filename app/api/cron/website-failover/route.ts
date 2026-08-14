import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { connectGeneratedSiteDomain } from "@/lib/domains/connect-generated-site";
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

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: websites, error } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,domain,platform_domain,hosting_node_id,status,deployment_status")
    .eq("status", "live")
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
      .select("id,name,status,last_health_check_at")
      .eq("id", nodeId)
      .maybeSingle();

    if (nodeError) {
      results.push({ websiteId: website.id, state: "node_read_error" });
      continue;
    }

    const unhealthy = !node || node.status !== "healthy" || !healthIsFresh(node.last_health_check_at);
    if (!unhealthy) {
      results.push({ websiteId: website.id, state: "healthy", node: node.name });
      continue;
    }

    const customDomain = String(website.domain || "").trim().toLowerCase();
    if (!customDomain) {
      results.push({
        websiteId: website.id,
        state: "platform_domain_requires_wildcard_failover",
        node: node?.name || null,
      });
      continue;
    }

    try {
      const recovery = await failoverWebsiteToHealthyNode(String(website.location_id));
      await connectGeneratedSiteDomain(String(website.location_id), customDomain);

      const now = new Date().toISOString();
      await supabaseAdmin
        .from("business_websites")
        .update({
          deployment_status: "deployed",
          status: "provisioning",
          last_deployed_at: now,
          last_error: null,
          updated_at: now,
        })
        .eq("id", website.id);

      await supabaseAdmin
        .from("locations")
        .update({
          included_domain_connection_status: "awaiting_dns",
          included_domain_verification_checked_at: now,
          updated_at: now,
        })
        .eq("id", website.location_id);

      results.push({
        websiteId: website.id,
        locationId: website.location_id,
        state: "failed_over",
        fromNode: node?.name || nodeId,
        toNode: recovery.node.name,
        version: recovery.version,
      });
    } catch (failoverError) {
      const message = failoverError instanceof Error ? failoverError.message : "website_failover_failed";
      await supabaseAdmin
        .from("business_websites")
        .update({ last_error: message.slice(0, 500), updated_at: new Date().toISOString() })
        .eq("id", website.id);
      results.push({ websiteId: website.id, state: "failover_retry", error: message });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    failedOver: results.filter((item) => item.state === "failed_over").length,
    retrying: results.filter((item) => item.state === "failover_retry").length,
    results,
  });
}
