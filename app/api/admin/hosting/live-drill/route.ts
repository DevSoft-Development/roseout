import { NextRequest, NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { switchPlatformWildcardToNode } from "@/lib/domains/vercel-wildcard-failover";
import { failoverWebsiteToHealthyNode } from "@/lib/hosting/lightsail-failover";
import { findExactHealthyReplica } from "@/lib/hosting/website-replication";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CONFIRMATION = "LIVE DR THEOUTHAVEN LOUNGE";
const DEMO_KEY = "real_location_mirror_demo";
const HEALTH_MAX_AGE_MS = 10 * 60 * 1000;
const FAILBACK_STABILITY_MS = 15 * 60 * 1000;

function isFresh(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() - HEALTH_MAX_AGE_MS;
}

function isSustained(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp <= Date.now() - FAILBACK_STABILITY_MS;
}

async function loadDemoWebsite() {
  const { data: location, error: locationError } = await supabaseAdmin
    .from("locations")
    .select("id,name,is_demo,demo_key,demo_visible_publicly,public_visibility_tier")
    .eq("demo_key", DEMO_KEY)
    .eq("is_demo", true)
    .eq("demo_visible_publicly", false)
    .eq("public_visibility_tier", "hidden")
    .limit(1)
    .maybeSingle();
  if (locationError) throw locationError;
  if (!location) throw new Error("live_dr_demo_location_missing");

  const { data: website, error: websiteError } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,domain,platform_domain,status,deployment_status,hosting_node_id,failover_source_node_id,published_version,last_deployed_at")
    .eq("location_id", location.id)
    .maybeSingle();
  if (websiteError) throw websiteError;
  if (!website) throw new Error("live_dr_demo_website_missing");
  if (website.domain) throw new Error("live_dr_demo_must_not_use_customer_domain");
  if (!website.platform_domain) throw new Error("live_dr_demo_platform_domain_missing");

  return { location, website };
}

async function loadNode(nodeId: string | null) {
  if (!nodeId) return null;
  const { data, error } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,name,role,status,public_ip,last_health_check_at,healthy_since,cpu_percent,memory_percent,disk_percent")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function snapshot() {
  const { location, website } = await loadDemoWebsite();
  const [currentNode, sourceNode] = await Promise.all([
    loadNode(website.hosting_node_id),
    loadNode(website.failover_source_node_id),
  ]);

  return {
    confirmation: CONFIRMATION,
    demo: {
      locationId: location.id,
      name: location.name,
      websiteId: website.id,
      platformDomain: website.platform_domain,
      status: website.status,
      deploymentStatus: website.deployment_status,
      publishedVersion: Number(website.published_version || 0),
      currentNode: currentNode?.name || null,
      currentNodeRole: currentNode?.role || null,
      failedOver: Boolean(website.failover_source_node_id),
      sourceNode: sourceNode?.name || null,
      lastDeployedAt: website.last_deployed_at,
    },
  };
}

export async function GET() {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);
  try {
    return NextResponse.json({ ok: true, ...(await snapshot()) });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Unable to load live DR drill state." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  await requireAdminRole(ADMIN_PAGE_ACCESS.dashboard);

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body.action || "");
    const confirmation = String(body.confirmation || "");
    if (confirmation !== CONFIRMATION) {
      return NextResponse.json({ ok: false, error: "Exact live-DR confirmation phrase required." }, { status: 400 });
    }

    const { location, website } = await loadDemoWebsite();

    if (action === "failover") {
      if (website.failover_source_node_id) {
        return NextResponse.json({ ok: false, error: "Demo website is already failed over." }, { status: 409 });
      }

      const currentNode = await loadNode(website.hosting_node_id);
      if (!currentNode || currentNode.role !== "primary") {
        return NextResponse.json({ ok: false, error: "Demo website is not currently assigned to the primary node." }, { status: 409 });
      }

      const version = Number(website.published_version || 0);
      if (!Number.isInteger(version) || version < 1) {
        return NextResponse.json({ ok: false, error: "Demo website has no valid published version." }, { status: 409 });
      }
      const exactReplica = await findExactHealthyReplica(String(website.id), version, String(currentNode.id));
      if (!exactReplica || exactReplica.role !== "failover") {
        return NextResponse.json({ ok: false, error: "Exact published-version failover replica is not healthy and ready." }, { status: 409 });
      }

      const recovery = await failoverWebsiteToHealthyNode(String(location.id));
      if (recovery.recoveryMode !== "exact_replica") {
        throw new Error("live_dr_emergency_deploy_not_allowed");
      }
      const routing = await switchPlatformWildcardToNode(recovery.node.id, recovery.node.public_ip);
      const now = new Date().toISOString();
      const { error: updateError } = await supabaseAdmin
        .from("business_websites")
        .update({
          status: "live",
          deployment_status: "deployed",
          last_error: null,
          last_deployed_at: now,
          updated_at: now,
        })
        .eq("id", website.id);
      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        action: "failed_over",
        fromNode: currentNode.name,
        toNode: recovery.node.name,
        version: recovery.version,
        recoveryMode: recovery.recoveryMode,
        routingChanged: routing.changed,
        state: (await snapshot()).demo,
      });
    }

    if (action === "failback") {
      if (!website.failover_source_node_id) {
        return NextResponse.json({ ok: false, error: "Demo website is not currently failed over." }, { status: 409 });
      }

      const sourceNode = await loadNode(website.failover_source_node_id);
      if (!sourceNode || sourceNode.role !== "primary" || sourceNode.status !== "healthy" || !sourceNode.public_ip || !isFresh(sourceNode.last_health_check_at)) {
        return NextResponse.json({ ok: false, error: "Primary node is not healthy and fresh enough for failback." }, { status: 409 });
      }
      if (!isSustained(sourceNode.healthy_since)) {
        return NextResponse.json({ ok: false, error: "Primary node has not satisfied the 15-minute failback stability window." }, { status: 409 });
      }

      const version = Number(website.published_version || 0);
      const { data: replica, error: replicaError } = await supabaseAdmin
        .from("website_hosting_replicas")
        .select("version,status")
        .eq("website_id", website.id)
        .eq("node_id", sourceNode.id)
        .maybeSingle();
      if (replicaError) throw replicaError;
      if (!replica || replica.status !== "synced" || Number(replica.version) !== version) {
        return NextResponse.json({ ok: false, error: "Exact published-version replica is not ready on the primary node." }, { status: 409 });
      }

      const routing = await switchPlatformWildcardToNode(sourceNode.id, sourceNode.public_ip);
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
      if (updateError) throw updateError;

      return NextResponse.json({
        ok: true,
        action: "failed_back",
        toNode: sourceNode.name,
        version,
        routingChanged: routing.changed,
        state: (await snapshot()).demo,
      });
    }

    return NextResponse.json({ ok: false, error: "Unsupported live DR action." }, { status: 400 });
  } catch (error) {
    console.error("hosting_live_dr_drill_failed", error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Live DR drill action failed." }, { status: 500 });
  }
}
