import "server-only";

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

export async function replicateWebsiteToStandby(input: WebsiteDeployRequest, primaryNodeId: string | null) {
  const node = await selectLightsailFailoverNode(primaryNodeId);
  if (!node?.deploy_url) throw new Error("no_healthy_failover_capacity");

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
    const { data: node, error: nodeError } = await supabaseAdmin
      .from("website_hosting_nodes")
      .select("id,name,provider,public_ip,max_sites,role,deploy_url,status,last_health_check_at,cpu_percent,memory_percent,disk_percent")
      .eq("id", replica.node_id)
      .maybeSingle();
    if (nodeError || !node || node.status !== "healthy" || !node.deploy_url) continue;

    const healthTime = Date.parse(String(node.last_health_check_at || ""));
    if (!Number.isFinite(healthTime) || healthTime <= Date.now() - 10 * 60 * 1000) continue;
    if (node.cpu_percent != null && Number(node.cpu_percent) >= 70) continue;
    if (node.memory_percent != null && Number(node.memory_percent) >= 70) continue;
    if (node.disk_percent != null && Number(node.disk_percent) >= 75) continue;

    return node as WebsiteHostingNode;
  }

  return null;
}
