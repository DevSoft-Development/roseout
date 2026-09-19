import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { replicateWebsiteToNode, replicateWebsiteToStandby } from "@/lib/hosting/website-replication";
import { renderWebsiteArtifact } from "@/lib/websites/static-renderer";
import type { BusinessWebsite } from "@/lib/websites/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BATCH_SIZE = 10;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: websites, error } = await supabaseAdmin
    .from("business_websites")
    .select("*")
    .eq("status", "live")
    .not("hosting_node_id", "is", null)
    .order("updated_at", { ascending: true })
    .limit(BATCH_SIZE);
  if (error) return NextResponse.json({ ok: false, error: "Unable to load websites." }, { status: 500 });

  const results: Array<Record<string, unknown>> = [];
  for (const websiteRow of websites || []) {
    const version = Number(websiteRow.published_version || websiteRow.deployment_version || 0);
    if (!Number.isInteger(version) || version < 1) continue;

    const hostingNodeId = String(websiteRow.hosting_node_id || "");
    const failbackSourceNodeId = String(websiteRow.failover_source_node_id || "");
    const requiresPrimaryRebuild = Boolean(failbackSourceNodeId && failbackSourceNodeId !== hostingNodeId);

    const { data: exactReplicas, error: replicaError } = await supabaseAdmin
      .from("website_hosting_replicas")
      .select("node_id,version,status")
      .eq("website_id", websiteRow.id)
      .eq("version", version)
      .eq("status", "synced");
    if (replicaError) {
      results.push({ websiteId: websiteRow.id, state: "replica_lookup_failed" });
      continue;
    }

    const replicaRows = exactReplicas || [];
    if (requiresPrimaryRebuild) {
      const sourceReplica = replicaRows.find((replica) => replica.node_id === failbackSourceNodeId);
      if (sourceReplica) {
        results.push({
          websiteId: websiteRow.id,
          state: "primary_replica_ready",
          nodeId: sourceReplica.node_id,
          version,
        });
        continue;
      }
    } else {
      const primaryReplica = replicaRows.find((replica) => replica.node_id === hostingNodeId);
      const standbyReplica = replicaRows.find((replica) => replica.node_id !== hostingNodeId);
      if (primaryReplica && standbyReplica) {
        results.push({
          websiteId: websiteRow.id,
          state: "already_synced",
          nodeId: primaryReplica.node_id,
          standbyNodeId: standbyReplica.node_id,
          version,
        });
        continue;
      }
    }

    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,name,title,address,phone,hours,reservation_link,image_url")
      .eq("id", websiteRow.location_id)
      .maybeSingle();
    if (locationError || !location) {
      results.push({ websiteId: websiteRow.id, state: "location_missing" });
      continue;
    }

    const website = websiteRow as BusinessWebsite;
    const files = renderWebsiteArtifact(website, {
      id: String(location.id),
      name: nullableString(location.name),
      title: nullableString(location.title),
      address: nullableString(location.address),
      phone: nullableString(location.phone),
      hours: nullableString(location.hours),
      reservation_link: nullableString(location.reservation_link),
      image_url: nullableString(location.image_url),
    });
    const domain = String(websiteRow.domain || websiteRow.platform_domain || "").trim().toLowerCase();
    if (!domain) {
      results.push({ websiteId: websiteRow.id, state: "domain_missing" });
      continue;
    }

    const deployRequest = {
      websiteId: String(websiteRow.id),
      locationId: String(websiteRow.location_id),
      version,
      sitePath: String(websiteRow.site_path || `/srv/sites/${websiteRow.location_id}`),
      domain,
      files,
    };

    try {
      if (requiresPrimaryRebuild) {
        const replica = await replicateWebsiteToNode(deployRequest, failbackSourceNodeId);
        results.push({
          websiteId: websiteRow.id,
          state: "primary_rebuilt",
          node: replica.node.name,
          nodeId: replica.node.id,
          version,
        });
      } else {
        const hasPrimaryReplica = replicaRows.some((replica) => replica.node_id === hostingNodeId);
        const hasStandbyReplica = replicaRows.some((replica) => replica.node_id !== hostingNodeId);
        let primaryReplica = null;
        let standbyReplica = null;

        if (!hasPrimaryReplica) {
          primaryReplica = await replicateWebsiteToNode(deployRequest, hostingNodeId);
        }
        if (!hasStandbyReplica) {
          standbyReplica = await replicateWebsiteToStandby(deployRequest, hostingNodeId);
        }

        results.push({
          websiteId: websiteRow.id,
          state: primaryReplica && standbyReplica
            ? "primary_and_standby_rebuilt"
            : primaryReplica
              ? "primary_rebuilt"
              : "repaired",
          primaryNodeId: primaryReplica?.node.id || hostingNodeId,
          standbyNodeId: standbyReplica?.node.id || replicaRows.find((replica) => replica.node_id !== hostingNodeId)?.node_id || null,
          version,
        });
      }
    } catch (repairError) {
      results.push({
        websiteId: websiteRow.id,
        state: requiresPrimaryRebuild ? "primary_rebuild_retry" : "repair_retry",
        targetNodeId: requiresPrimaryRebuild ? failbackSourceNodeId : hostingNodeId,
        error: repairError instanceof Error ? repairError.message : "website_replica_repair_failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    repaired: results.filter((item) => item.state === "repaired" || item.state === "primary_rebuilt" || item.state === "primary_and_standby_rebuilt").length,
    primaryRebuilt: results.filter((item) => item.state === "primary_rebuilt" || item.state === "primary_and_standby_rebuilt").length,
    retrying: results.filter((item) => item.state === "repair_retry" || item.state === "primary_rebuild_retry").length,
    results,
  });
}
