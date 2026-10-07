import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { supabaseAdmin } from "@/lib/supabase-admin";

function required(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`pos_device_missing_${field}`);
  return normalized;
}

function digest(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export async function createPosDeviceClaimCode(input: {
  deviceId: string;
  ttlMinutes?: number;
}) {
  const deviceId = required(input.deviceId, "device_id");
  const code = randomBytes(18).toString("base64url");
  const expiresAt = new Date(Date.now() + Math.max(5, Math.min(1440, input.ttlMinutes || 60)) * 60_000).toISOString();

  const { error } = await supabaseAdmin.from("pos_device_claim_codes").insert({
    device_id: deviceId,
    code_hash: digest(code),
    expires_at: expiresAt,
  });
  if (error) throw new Error(`pos_device_claim_code_create_failed:${error.message}`);
  return { deviceId, code, pairingCode: `${deviceId}.${code}`, expiresAt };
}

export async function claimPosDeviceCredential(input: {
  deviceId: string;
  claimCode: string;
  installationId: string;
}) {
  const deviceId = required(input.deviceId, "device_id");
  const claimCode = required(input.claimCode, "claim_code");
  const installationId = required(input.installationId, "installation_id");
  const credential = randomBytes(32).toString("base64url");

  const { data, error } = await supabaseAdmin.rpc("pos_claim_device_api_credential", {
    p_device_id: deviceId,
    p_code_hash: digest(claimCode),
    p_installation_id: installationId,
    p_credential_hash: digest(credential),
  });
  if (error) throw new Error(error.message || "pos_device_claim_failed");
  const assignment = Array.isArray(data) ? data[0] : data;
  if (!assignment?.location_id) throw new Error("pos_device_not_assigned");

  return {
    deviceId,
    locationId: String(assignment.location_id),
    role: String(assignment.role),
    stationKey: String(assignment.station_key || "default"),
    credential,
  };
}

export async function authenticatePosDeviceCredential(input: {
  bearerToken: string;
  deviceId?: string | null;
}) {
  const bearerToken = required(input.bearerToken, "credential");
  let query = supabaseAdmin
    .from("pos_device_api_credentials")
    .select("id,device_id,installation_id,revoked_at,last_used_at")
    .eq("credential_hash", digest(bearerToken))
    .is("revoked_at", null);
  if (input.deviceId) query = query.eq("device_id", required(input.deviceId, "device_id"));
  const { data: credential, error } = await query.maybeSingle();
  if (error) throw new Error(`pos_device_auth_lookup_failed:${error.message}`);
  if (!credential?.device_id) throw new Error("pos_device_credential_invalid");

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from("pos_hardware_assignments")
    .select("location_id,role,station_key")
    .eq("device_id", credential.device_id)
    .eq("assignment_status", "active")
    .maybeSingle();
  if (assignmentError) throw new Error(`pos_device_assignment_lookup_failed:${assignmentError.message}`);
  if (!assignment?.location_id) throw new Error("pos_device_not_assigned");

  const lastUsedAt = credential.last_used_at ? Date.parse(String(credential.last_used_at)) : 0;
  if (!lastUsedAt || Date.now() - lastUsedAt > 5 * 60_000) {
    await supabaseAdmin
      .from("pos_device_api_credentials")
      .update({ last_used_at: new Date().toISOString() })
      .eq("id", credential.id);
  }

  return {
    deviceId: String(credential.device_id),
    locationId: String(assignment.location_id),
    role: String(assignment.role),
    stationKey: String(assignment.station_key || "default"),
    installationId: String(credential.installation_id),
  };
}
