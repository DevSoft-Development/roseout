import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

const WEBSITE_MUTATION_LEASE_MS = 15 * 60 * 1000;

export type WebsiteMutationLease = {
  token: string;
  expiresAt: string;
};

export async function claimWebsiteMutationLease(websiteId: string): Promise<WebsiteMutationLease | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + WEBSITE_MUTATION_LEASE_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("business_websites")
    .update({
      failover_lease_token: token,
      failover_lease_expires_at: expiresAt,
      updated_at: nowIso,
    })
    .eq("id", websiteId)
    .or(`failover_lease_expires_at.is.null,failover_lease_expires_at.lt.${nowIso}`)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data?.id ? { token, expiresAt } : null;
}

export async function releaseWebsiteMutationLease(websiteId: string, token: string) {
  const { error } = await supabaseAdmin
    .from("business_websites")
    .update({
      failover_lease_token: null,
      failover_lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", websiteId)
    .eq("failover_lease_token", token);
  if (error) console.error("Website mutation lease release failed", { websiteId, error: error.message });
}
