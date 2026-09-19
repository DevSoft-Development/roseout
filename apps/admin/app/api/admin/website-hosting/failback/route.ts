import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { switchPlatformWildcardToNode } from "@/lib/domains/vercel-wildcard-failover";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NODE_HEALTH_MAX_AGE_MS = 10 * 60 * 1000;

function healthIsFresh(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() - NODE_HEALTH_MAX_AGE_MS;
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin"]);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => ({})) as { websiteId?: string };
  const websiteId = String(body.websiteId || "").trim();
  if (!websiteId) return NextResponse.json({ ok: false, error: "website_id_required" }, { status: 400 });

  const { data: website, error: websiteError } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,platform_domain,hosting_node_id,failover_source_node_id,published_version,status,deployment_status")
    .eq("id", websiteId)
    .maybeSingle();

  if (websiteError) return NextResponse.json({ ok: false, error: "website_read_failed" }, { status: 500 });
  if (!website) return NextResponse.json({ ok: false, error: "website_not_found" }, { status: 404 });
  if (!website.platform_domain) return NextResponse.json({ ok: false, error: "platform_domain_required" }, { status: 409 });

  const targetNodeId = String(website.failover_source_node_id || "");
  if (!targetNodeId) return NextResponse.json({ ok: false, error: "failback_source_missing" }, { status: 409 });
  if (targetNodeId === String(website.hosting_node_id || "")) {
    return NextResponse.json({ ok: true, changed: false, state: "already_on_primary" });
  }

  const { data: node, error: nodeError } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,name,status,public_ip,last_health_check_at")
    .eq("id", targetNodeId)
    .maybeSingle();

  if (nodeError) return NextResponse.json({ ok: false, error: "node_read_failed" }, { status: 500 });
  if (!node?.public_ip || node.status !== "healthy" || !healthIsFresh(node.last_health_check_at)) {
    return NextResponse.json({ ok: false, error: "target_node_not_healthy" }, { status: 409 });
  }

  const version = Number(website.published_version || 0);
  const { data: replica, error: replicaError } = await supabaseAdmin
    .from("website_hosting_replicas")
    .select("version,status")
    .eq("website_id", website.id)
    .eq("node_id", targetNodeId)
    .maybeSingle();

  if (replicaError) return NextResponse.json({ ok: false, error: "replica_read_failed" }, { status: 500 });
  if (!replica || replica.status !== "synced" || Number(replica.version) !== version) {
    return NextResponse.json({ ok: false, error: "target_node_version_not_verified" }, { status: 409 });
  }

  const routing = await switchPlatformWildcardToNode(node.id, String(node.public_ip));
  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("business_websites")
    .update({
      hosting_node_id: node.id,
      failover_source_node_id: null,
      status: "live",
      deployment_status: "deployed",
      last_error: null,
      last_deployed_at: now,
      updated_at: now,
    })
    .eq("id", website.id);

  if (updateError) {
    return NextResponse.json({ ok: false, error: "failback_state_update_failed", routing }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    changed: routing.changed,
    state: "failed_back",
    websiteId: website.id,
    platformDomain: website.platform_domain,
    node: node.name,
    version,
  });
}
