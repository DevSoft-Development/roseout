import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildDnsRecords } from "@/lib/domains/dns-records";
import { configureDomainDns } from "@/lib/domains/gateway";
import { allocateLightsailWebsiteNode } from "@/lib/hosting/lightsail-nodes";

export type ConnectedGeneratedSite = {
  domain: string;
  websiteId: string;
  nodeName: string;
  deploymentStatus: string;
  dnsStatus: string;
  sslStatus: string;
  status: string;
};

export async function connectGeneratedSiteDomain(locationId: string, domain: string): Promise<ConnectedGeneratedSite> {
  const normalizedDomain = String(domain || "").trim().toLowerCase();
  if (!locationId || !normalizedDomain) throw new Error("invalid_domain_connection");

  const { website, node } = await allocateLightsailWebsiteNode(locationId, normalizedDomain);
  const records = buildDnsRecords(normalizedDomain, node.public_ip, normalizedDomain);

  await configureDomainDns(normalizedDomain, records);

  const { data: updated, error: statusError } = await supabaseAdmin
    .from("business_websites")
    .update({
      dns_status: "configured",
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", website.id)
    .select("id,status,deployment_status,dns_status,ssl_status")
    .single();

  if (statusError) throw statusError;

  return {
    domain: normalizedDomain,
    websiteId: updated.id,
    nodeName: node.name,
    deploymentStatus: updated.deployment_status,
    dnsStatus: updated.dns_status,
    sslStatus: updated.ssl_status,
    status: updated.status,
  };
}
