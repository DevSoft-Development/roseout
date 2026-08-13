import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";

const HEALTH_TIMEOUT_MS = 5000;

export async function refreshLightsailNodeHealth(nodeName: string, activate = false) {
  const { data: node, error: nodeError } = await supabaseAdmin
    .from("website_hosting_nodes")
    .select("id,name,provider,public_ip,status,accepting_new_sites")
    .eq("name", nodeName)
    .eq("provider", "lightsail")
    .maybeSingle();

  if (nodeError) throw nodeError;
  if (!node?.public_ip) throw new Error("hosting_node_ip_missing");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);

  try {
    const response = await fetch(`http://${node.public_ip}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { accept: "text/plain" },
    });
    const body = (await response.text()).trim().toLowerCase();
    const healthy = response.ok && body === "ok";
    const checkedAt = new Date().toISOString();

    const { error: updateError } = await supabaseAdmin
      .from("website_hosting_nodes")
      .update({
        status: healthy ? "healthy" : "degraded",
        accepting_new_sites: healthy ? (activate || Boolean(node.accepting_new_sites)) : false,
        last_health_check_at: checkedAt,
        updated_at: checkedAt,
      })
      .eq("id", node.id);

    if (updateError) throw updateError;

    return {
      ok: healthy,
      node: node.name,
      public_ip: String(node.public_ip),
      status: healthy ? "healthy" : "degraded",
      accepting_new_sites: healthy ? (activate || Boolean(node.accepting_new_sites)) : false,
      checked_at: checkedAt,
    };
  } catch (error) {
    const checkedAt = new Date().toISOString();
    await supabaseAdmin
      .from("website_hosting_nodes")
      .update({
        status: "offline",
        accepting_new_sites: false,
        last_health_check_at: checkedAt,
        updated_at: checkedAt,
      })
      .eq("id", node.id);

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
