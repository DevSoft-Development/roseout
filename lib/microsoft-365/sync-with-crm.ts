import "server-only";

import { randomUUID } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncMicrosoft365ForUser } from "./sync";
import { syncMicrosoft365TasksWithCrm } from "./task-crm-sync";

const MICROSOFT_SYNC_LEASE_MS = 8 * 60 * 1000;

type MicrosoftSyncLease = {
  token: string;
  expiresAt: string;
};

async function claimMicrosoftSyncLease(userId: string): Promise<MicrosoftSyncLease | null> {
  const now = new Date();
  const nowIso = now.toISOString();
  const token = randomUUID();
  const expiresAt = new Date(now.getTime() + MICROSOFT_SYNC_LEASE_MS).toISOString();

  const { data, error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .update({
      sync_lease_token: token,
      sync_lease_expires_at: expiresAt,
      updated_at: nowIso,
    })
    .eq("user_id", userId)
    .or(`sync_lease_expires_at.is.null,sync_lease_expires_at.lt.${nowIso}`)
    .select("user_id")
    .maybeSingle();

  if (error) throw error;
  if (data?.user_id) return { token, expiresAt };

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("microsoft_365_connections")
    .select("user_id,sync_lease_expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (!existing?.user_id) throw new Error("Microsoft 365 is not connected.");
  return null;
}

async function releaseMicrosoftSyncLease(userId: string, token: string) {
  const { error } = await supabaseAdmin
    .from("microsoft_365_connections")
    .update({
      sync_lease_token: null,
      sync_lease_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("sync_lease_token", token);
  if (error) console.error("Microsoft 365 sync lease release failed", { userId, error: error.message });
}

export async function syncMicrosoft365WorkspaceForUser(userId: string) {
  const lease = await claimMicrosoftSyncLease(userId);
  if (!lease) {
    return {
      skipped: true,
      reason: "sync_inflight",
      leaseMs: MICROSOFT_SYNC_LEASE_MS,
    };
  }

  try {
    const base = await syncMicrosoft365ForUser(userId);
    const crmTasks = await syncMicrosoft365TasksWithCrm(userId);
    return { ...base, crmTasks, leaseExpiresAt: lease.expiresAt };
  } finally {
    await releaseMicrosoftSyncLease(userId, lease.token);
  }
}
