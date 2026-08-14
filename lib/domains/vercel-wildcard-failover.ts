import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  checkVercelDnsReadCapability,
  findVercelDnsRecord,
  updateVercelDnsRecord,
} from "@/lib/domains/vercel-dns-client";

const PLATFORM_ZONE = "theouthaven.com";
const PLATFORM_RECORD_NAME = "*";
const PLATFORM_RECORD_TYPE = "A";

async function assertPlatformCoverage(nodeId: string) {
  const { data: websites, error: websiteError } = await supabaseAdmin
    .from("business_websites")
    .select("id,published_version")
    .eq("status", "live")
    .not("platform_domain", "is", null);
  if (websiteError) throw websiteError;

  for (const website of websites || []) {
    const version = Number(website.published_version || 0);
    if (!Number.isInteger(version) || version < 1) continue;
    const { data: replica, error: replicaError } = await supabaseAdmin
      .from("website_hosting_replicas")
      .select("version,status")
      .eq("website_id", website.id)
      .eq("node_id", nodeId)
      .maybeSingle();
    if (replicaError) throw replicaError;
    if (!replica || replica.status !== "synced" || Number(replica.version) !== version) {
      throw new Error("platform_failover_node_not_fully_replicated");
    }
  }
}

export async function checkPlatformWildcardDnsCapability() {
  return checkVercelDnsReadCapability(PLATFORM_ZONE, PLATFORM_RECORD_NAME, PLATFORM_RECORD_TYPE);
}

export async function switchPlatformWildcardToNode(nodeId: string, publicIp: string) {
  await assertPlatformCoverage(nodeId);

  const wildcard = await findVercelDnsRecord(PLATFORM_ZONE, PLATFORM_RECORD_NAME, PLATFORM_RECORD_TYPE);
  if (!wildcard?.id) throw new Error("platform_wildcard_a_record_missing");
  if (wildcard.value === publicIp) return { changed: false, recordId: wildcard.id, value: publicIp };

  await updateVercelDnsRecord(wildcard.id, publicIp, 60);

  return { changed: true, recordId: wildcard.id, value: publicIp };
}
