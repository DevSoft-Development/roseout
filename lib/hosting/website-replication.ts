import "server-only";

import { invokePlatformBackground, platformJobGatewayConfigured } from "@/lib/aws/platform-jobs";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { deployWebsiteArtifact } from "@/lib/websites/deploy-client";
import { selectLightsailFailoverNode, type WebsiteHostingNode } from "@/lib/hosting/lightsail-nodes";
import type { WebsiteDeployRequest } from "@/lib/websites/publish-contract";

type ReplicaRow = {
  website_id: string;
  node_id: string;
  version: number;
  status: string;
  synced_at: string | null;
};

type ReplicaTargetNode = WebsiteHostingNode & {
  status: string;
  last_health_check_at: string | null;
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
};

function healthIsFresh(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() - 10 * 60 * 1000;
}

function nodeIsHealthyReplicaTarget(node: ReplicaTargetNode) {
  return node.status === "healthy"
    && Boolean(node.deploy_url)
    && Boolean(node.public_ip)
    && healthIsFresh(node.last_health_check_at)
    && (node.cpu_percent == null || Number(node.cpu_percent) < 70)
    && (node.memory_percent == null || Number(node.memory_percent) < 70)
    && (node.disk_percent == null || Number(node.disk_percent) < 75);
}

async function loadReplicaTarget(nodeId: string) {
  const { data, error } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,name,provider,public_ip,max_sites,role,deploy_url,status,last_health_check_at,cpu_percent,memory_percent,disk_percent")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const node = data as ReplicaTargetNode;
  return nodeIsHealthyReplicaTarget(node) ? node : null;
}

async function upsertReplicaState(websiteId: string, nodeId: string, version: number, status: "syncing" | "synced" | "failed", lastError?: string | null) {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("website_hosting_replicas")
    .upsert({
      website_id: websiteId,
      node_id: nodeId,
      version,
      status,
      synced_at: status === "synced" ? now : null,
      last_error: lastError ? lastError.slice(0, 500) : null,
      updated_at: now,
    }, { onConflict: "website_id,node_id" });
  if (error) throw error;
}

async function requestReplicaRepair(input: WebsiteDeployRequest, reason: string) {
  if (!platformJobGatewayConfigured()) return;
  try {
    await invokePlatformBackground("node:/api/cron/managed?job=website-replica-repair", {
      source: "website_replication_failed",
      website_id: input.websiteId,
      location_id: input.locationId,
      version: input.version,
      reason: reason.slice(0, 200),
    });
  } catch (eventError) {
    // The 15-minute EventBridge reconciliation remains the fail-safe if this
    // immediate change-driven repair signal cannot be delivered.
    console.error("website_replica_repair_event_failed", {
      websiteId: input.websiteId,
      version: input.version,
      error: eventError instanceof Error ? eventError.message : String(eventError),
    });
  }
}

export async function recordWebsiteReplicaSynced(websiteId: string, nodeId: string, version: number) {
  await upsertReplicaState(websiteId, nodeId, version, "synced");
}

async function replicateWebsiteToResolvedNode(input: WebsiteDeployRequest, node: ReplicaTargetNode) {
  if (!node.deploy_url) throw new Error("replica_target_missing_deploy_url");

  await upsertReplicaState(input.websiteId, node.id, input.version, "syncing");
  try {
    const result = await deployWebsiteArtifact(input, { url: node.deploy_url });
    await upsertReplicaState(input.websiteId, node.id, input.version, "synced");
    return { node, result, version: input.version };
  } catch (error) {
    const message = error instanceof Error ? error.message : "website_replication_failed";
    await upsertReplicaState(input.websiteId, node.id, input.version, "failed", message).catch(() => undefined);
    throw error;
  }
}

export async function replicateWebsiteToNode(input: WebsiteDeployRequest, nodeId: string) {
  const node = await loadReplicaTarget(nodeId);
  if (!node) throw new Error("replica_target_unhealthy");
  return replicateWebsiteToResolvedNode(input, node);
}

export async function replicateWebsiteToStandby(input: WebsiteDeployRequest, primaryNodeId: string | null) {
  try {
    const selected = await selectLightsailFailoverNode(primaryNodeId);
    if (!selected?.id) throw new Error("no_healthy_failover_capacity");

    const node = await loadReplicaTarget(selected.id);
    if (!node) throw new Error("no_healthy_failover_capacity");
    return await replicateWebsiteToResolvedNode(input, node);
  } catch (error) {
    await requestReplicaRepair(
      input,
      error instanceof Error ? error.message : "website_replication_failed",
    );
    throw error;
  }
}

export async function findExactHealthyReplica(websiteId: string, version: number, excludeNodeId?: string | null) {
  const { data: replicas, error } = await supabaseAdmin
    .from("website_hosting_replicas")
    .select("website_id,node_id,version,status,synced_at")
    .eq("website_id", websiteId)
    .eq("version", version)
    .eq("status", "synced")
    .order("synced_at", { ascending: false });
  if (error) throw error;

  for (const rawReplica of replicas || []) {
    const replica = rawReplica as ReplicaRow;
    if (excludeNodeId && replica.node_id === excludeNodeId) continue;
    const node = await loadReplicaTarget(replica.node_id);
    if (!node) continue;
    return node as WebsiteHostingNode;
  }

  return null;
}
