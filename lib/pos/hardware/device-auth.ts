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

  const { data: codeRow, error: codeError } = await supabaseAdmin
    .from("pos_device_claim_codes")
    .select("id,device_id,expires_at,used_at")
    .eq("device_id", deviceId)
    .eq("code_hash", digest(claimCode))
    .maybeSingle();
  if (codeError) throw new Error(`pos_device_claim_lookup_failed:${codeError.message}`);
  if (!codeRow || codeRow.used_at || Date.parse(codeRow.expires_at) <= Date.now()) {
    throw new Error("pos_device_claim_code_invalid");
  }

  const { data: assignment, error: assignmentError } = await supabaseAdmin
    .from("pos_hardware_assignments")
    .select("location_id,role,station_key")
    .eq("device_id", deviceId)
    .eq("assignment_status", "active")
    .maybeSingle();
  if (assignmentError) throw new Error(`pos_device_assignment_lookup_failed:${assignmentError.message}`);
  if (!assignment?.location_id) throw new Error("pos_device_not_assigned");

  const credential = randomBytes(32).toString("base64url");
  const credentialHash = digest(credential);

  const { error: credentialError } = await supabaseAdmin
    .from("pos_device_api_credentials")
    .upsert({
      device_id: deviceId,
      installation_id: installationId,
      credential_hash: credentialHash,
      revoked_at: null,
      last_used_at: new Date().toISOString(),
    }, { onConflict: "device_id,installation_id" });
  if (credentialError) throw new Error(`pos_device_credential_create_failed:${credentialError.message}`);

  const { error: consumeError } = await supabaseAdmin
    .from("pos_device_claim_codes")
    .update({ used_at: new Date().toISOString() })
    .eq("id", codeRow.id)
    .is("used_at", null);
  if (consumeError) throw new Error(`pos_device_claim_consume_failed:${consumeError.message}`);

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
    .select("id,device_id,installation_id,revoked_at")
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

  await supabaseAdmin
    .from("pos_device_api_credentials")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", credential.id);

  return {
    deviceId: String(credential.device_id),
    locationId: String(assignment.location_id),
    role: String(assignment.role),
    stationKey: String(assignment.station_key || "default"),
    installationId: String(credential.installation_id),
  };
}
