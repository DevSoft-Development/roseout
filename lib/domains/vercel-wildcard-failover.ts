import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const PLATFORM_ZONE = "theouthaven.com";
const PLATFORM_RECORD_NAME = "*";

type VercelDnsRecord = {
  id: string;
  name: string;
  type: string;
  value: string;
};

function config() {
  const token = process.env.VERCEL_API_TOKEN?.trim();
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  if (!token || !teamId) throw new Error("vercel_dns_config_missing");
  return { token, teamId };
}

async function vercelRequest(path: string, operation: string, init?: RequestInit) {
  const { token } = config();
  const headers = new Headers(init?.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("content-type", "application/json");

  const response = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const code = typeof body?.error?.code === "string" ? body.error.code : "vercel_dns_request_failed";
    throw new Error(`${operation}:${response.status}:${code}`);
  }

  return body;
}

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

export async function switchPlatformWildcardToNode(nodeId: string, publicIp: string) {
  await assertPlatformCoverage(nodeId);
  const { teamId } = config();

  const recordsResponse = await vercelRequest(
    `/v5/domains/${encodeURIComponent(PLATFORM_ZONE)}/records?teamId=${encodeURIComponent(teamId)}&limit=100`,
    "vercel_dns_list_failed",
  );
  const records = (recordsResponse?.records || []) as VercelDnsRecord[];
  const wildcard = records.find((record) => record.name === PLATFORM_RECORD_NAME && record.type === "A");
  if (!wildcard?.id) throw new Error("platform_wildcard_a_record_missing");
  if (wildcard.value === publicIp) return { changed: false, recordId: wildcard.id, value: publicIp };

  await vercelRequest(
    `/v1/domains/records/${encodeURIComponent(wildcard.id)}?teamId=${encodeURIComponent(teamId)}`,
    "vercel_dns_patch_failed",
    {
      method: "PATCH",
      body: JSON.stringify({ value: publicIp, ttl: 60 }),
    },
  );

  return { changed: true, recordId: wildcard.id, value: publicIp };
}
