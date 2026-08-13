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
  domain: string | null;
  hosting_node_id: string | null;
  site_path: string | null;
  status: string;
  deployment_status: string;
  dns_status: string;
  ssl_status: string;
};

type CandidateNode = WebsiteHostingNode & {
  cpu_percent: number | null;
  memory_percent: number | null;
  disk_percent: number | null;
  last_health_check_at: string | null;
};

function normalizeDomain(domain: string | null | undefined) {
  const normalized = String(domain || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return normalized || null;
}

function isFreshHealthCheck(value: string | null | undefined) {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > Date.now() - 10 * 60 * 1000;
}

export async function allocateLightsailWebsiteNode(locationId: string, rawDomain?: string | null) {
  const domain = normalizeDomain(rawDomain);
  if (!locationId) throw new Error("invalid_website_assignment");

  const selectFields = "id,location_id,domain,hosting_node_id,site_path,status,deployment_status,dns_status,ssl_status";
  const { data: existing, error: existingError } = await supabaseAdmin
    .from("business_websites")
    .select(selectFields)
    .eq("location_id", locationId)
    .maybeSingle();

  if (existingError) throw existingError;
  const existingDomain = normalizeDomain(existing?.domain);
  if (existingDomain && domain && existingDomain !== domain) throw new Error("website_domain_conflict");

  if (existing?.hosting_node_id) {
    const { data: existingNode, error: nodeError } = await supabaseAdmin
      .from("website_hosting_nodes")
      .select("id,name,provider,public_ip,max_sites")
      .eq("id", existing.hosting_node_id)
      .single();
    if (nodeError || !existingNode?.public_ip) throw nodeError || new Error("hosting_node_unavailable");

    let website = existing;
    if (!existingDomain && domain) {
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("business_websites")
        .update({ domain, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select(selectFields)
        .single();
      if (updateError) throw updateError;
      website = updated;
    }

    return { website: website as BusinessWebsiteAssignment, node: existingNode as WebsiteHostingNode };
  }

  const { data: nodes, error: nodesError } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,name,provider,public_ip,max_sites,cpu_percent,memory_percent,disk_percent,last_health_check_at")
    .eq("provider", "lightsail")
    .eq("status", "healthy")
    .eq("accepting_new_sites", true)
    .not("public_ip", "is", null);
  if (nodesError) throw nodesError;

  const candidates: Array<{ node: CandidateNode; count: number }> = [];
  for (const rawNode of nodes || []) {
    const node = rawNode as CandidateNode;
    if ((node.cpu_percent != null && Number(node.cpu_percent) >= 70)
      || (node.memory_percent != null && Number(node.memory_percent) >= 70)
      || (node.disk_percent != null && Number(node.disk_percent) >= 75)
      || !isFreshHealthCheck(node.last_health_check_at)) continue;

    const { count, error: countError } = await supabaseAdmin
      .from("business_websites")
      .select("id", { count: "exact", head: true })
      .eq("hosting_node_id", node.id)
      .neq("status", "suspended");
    if (countError) throw countError;
    if ((count || 0) < Number(node.max_sites || 0)) candidates.push({ node, count: count || 0 });
  }

  candidates.sort((a, b) => (a.count / a.node.max_sites) - (b.count / b.node.max_sites));
  const selected = candidates[0]?.node;
  if (!selected) throw new Error("no_healthy_hosting_capacity");

  const assignment = {
    domain: domain || existingDomain,
    hosting_node_id: selected.id,
    site_path: `/srv/sites/${locationId}`,
    status: "provisioning",
    deployment_status: "pending",
  };

  if (existing) {
    const { data: website, error } = await supabaseAdmin
      .from("business_websites")
      .update({ ...assignment, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .select(selectFields)
      .single();
    if (error) throw error;
    return { website: website as BusinessWebsiteAssignment, node: selected as WebsiteHostingNode };
  }

  const { data: website, error: insertError } = await supabaseAdmin
    .from("business_websites")
    .insert({
      location_id: locationId,
      ...assignment,
      dns_status: "pending",
      ssl_status: "pending",
    })
    .select(selectFields)
    .single();
  if (insertError) {
    if (insertError.code === "23505") {
      const { data: collided } = await supabaseAdmin.from("business_websites").select(selectFields).eq("location_id", locationId).maybeSingle();
      if (collided) return allocateLightsailWebsiteNode(locationId, domain);
      throw new Error("website_domain_conflict");
    }
    throw insertError;
  }

  return { website: website as BusinessWebsiteAssignment, node: selected as WebsiteHostingNode };
}
