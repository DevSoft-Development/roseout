import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { moveWebsiteToLightsailNode, selectLightsailFailoverNode } from "@/lib/hosting/lightsail-nodes";
import { findExactHealthyReplica } from "@/lib/hosting/website-replication";
import { deployWebsiteArtifact } from "@/lib/websites/deploy-client";
import { renderWebsiteArtifact } from "@/lib/websites/static-renderer";
import type { BusinessWebsite } from "@/lib/websites/data";

function nullableString(value: unknown) {
  return typeof value === "string" ? value : null;
}

export async function failoverWebsiteToHealthyNode(locationId: string) {
  const { data: websiteRow, error: websiteError } = await supabaseAdmin
    .from("business_websites")
    .select("*")
    .eq("location_id", locationId)
    .maybeSingle();
  if (websiteError) throw websiteError;
  if (!websiteRow) throw new Error("website_missing");
  if (!websiteRow.hosting_node_id) throw new Error("website_hosting_node_missing");

  const sourceNodeId = String(websiteRow.hosting_node_id);
  const version = Number(websiteRow.published_version || websiteRow.deployment_version || 0);
  if (!Number.isInteger(version) || version < 1) throw new Error("website_has_no_published_version");

  const exactReplica = await findExactHealthyReplica(String(websiteRow.id), version, sourceNodeId);
  let failoverNode = exactReplica;
  let currentPath: string | null = null;
  let usedEmergencyDeploy = false;

  if (!failoverNode) {
    failoverNode = await selectLightsailFailoverNode(sourceNodeId);
    if (!failoverNode?.deploy_url) throw new Error("no_healthy_failover_capacity");

    const { data: location, error: locationError } = await supabaseAdmin
      .from("locations")
      .select("id,name,title,address,phone,hours,reservation_link,image_url")
      .eq("id", locationId)
      .maybeSingle();
    if (locationError) throw locationError;
    if (!location) throw new Error("website_location_missing");

    const website = websiteRow as BusinessWebsite;
    const renderLocation = {
      id: String(location.id),
      name: nullableString(location.name),
      title: nullableString(location.title),
      address: nullableString(location.address),
      phone: nullableString(location.phone),
      hours: nullableString(location.hours),
      reservation_link: nullableString(location.reservation_link),
      image_url: nullableString(location.image_url),
    };
    const files = renderWebsiteArtifact(website, renderLocation);
    const domain = String(websiteRow.domain || websiteRow.platform_domain || "").trim().toLowerCase();
    if (!domain) throw new Error("website_domain_missing");

    const result = await deployWebsiteArtifact({
      websiteId: String(websiteRow.id),
      locationId,
      version,
      sitePath: String(websiteRow.site_path || `/srv/sites/${locationId}`),
      domain,
      files,
    }, { url: failoverNode.deploy_url });
    currentPath = result.currentPath;
    usedEmergencyDeploy = true;
  }

  const moved = await moveWebsiteToLightsailNode(
    String(websiteRow.id),
    failoverNode.id,
    sourceNodeId,
  );

  return {
    website: moved,
    node: failoverNode,
    version,
    currentPath,
    usedEmergencyDeploy,
    recoveryMode: usedEmergencyDeploy ? "emergency_deploy" : "exact_replica",
  };
}
