import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

export type WebsiteHostingNode = {
  id: string;
  name: string;
  provider: "lightsail";
  public_ip: string;
  max_sites: number;
};

export type BusinessWebsiteAssignment = {
  id: string;
  location_id: string;
  domain: string;
  hosting_node_id: string;
  site_path: string;
  status: string;
  deployment_status: string;
  dns_status: string;
  ssl_status: string;
};

function normalizeDomain(domain: string) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function isFreshHealthCheck(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() - 10 * 60 * 1000;
}

export async function allocateLightsailWebsiteNode(locationId: string, rawDomain: string) {
  const domain = normalizeDomain(rawDomain);
  if (!locationId || !domain) throw new Error("invalid_website_assignment");

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("business_websites")
    .select("id,location_id,domain,hosting_node_id,site_path,status,deployment_status,dns_status,ssl_status")
    .eq("location_id", locationId)
    .maybeSingle();

  if (existingError) throw existingError;
  if (existing) {
    if (normalizeDomain(String(existing.domain || "")) !== domain) {
      throw new Error("website_domain_conflict");
    }

    const { data: existingNode, error: nodeError } = await supabaseAdmin
      .from("website_hosting_nodes")
      .select("id,name,provider,public_ip,max_sites")
      .eq("id", existing.hosting_node_id)
      .single();

    if (nodeError || !existingNode?.public_ip) {
      throw nodeError || new Error("hosting_node_unavailable");
    }

    return {
      website: existing as BusinessWebsiteAssignment,
      node: existingNode as WebsiteHostingNode,
    };
  }

  const { data: nodes, error: nodesError } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,name,provider,public_ip,max_sites,cpu_percent,memory_percent,disk_percent,last_health_check_at")
    .eq("provider", "lightsail")
    .eq("status", "healthy")
    .eq("accepting_new_sites", true)
    .not("public_ip", "is", null)
    .order("name", { ascending: true });

  if (nodesError) throw nodesError;

  const healthyNodes = (nodes || []).filter((node: any) =>
    (node.cpu_percent == null || Number(node.cpu_percent) < 70)
    && (node.memory_percent == null || Number(node.memory_percent) < 70)
    && (node.disk_percent == null || Number(node.disk_percent) < 75)
    && isFreshHealthCheck(node.last_health_check_at),
  );

  for (const node of healthyNodes) {
    const { count, error: countError } = await supabaseAdmin
      .from("business_websites")
      .select("id", { count: "exact", head: true })
      .eq("hosting_node_id", node.id)
      .neq("status", "suspended");

    if (countError) throw countError;
    if ((count || 0) >= Number(node.max_sites || 0)) continue;

    const { data: website, error: insertError } = await supabaseAdmin
      .from("business_websites")
      .insert({
        location_id: locationId,
        domain,
        hosting_node_id: node.id,
        site_path: `/srv/sites/${locationId}`,
        status: "provisioning",
        deployment_status: "pending",
        dns_status: "pending",
        ssl_status: "pending",
      })
      .select("id,location_id,domain,hosting_node_id,site_path,status,deployment_status,dns_status,ssl_status")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        return allocateLightsailWebsiteNode(locationId, domain);
      }
      throw insertError;
    }

    return {
      website: website as BusinessWebsiteAssignment,
      node: node as WebsiteHostingNode,
    };
  }

  throw new Error("no_healthy_hosting_capacity");
}
