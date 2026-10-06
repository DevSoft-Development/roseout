import "server-only";

import { supabaseAdmin } from "@/lib/supabase-admin";
import { getCertifiedHardware } from "@/lib/pos/hardware/catalog";
import type {
  PosHardwareAssignment,
  PosHardwareDeviceType,
  PosHardwareHealth,
} from "@/lib/pos/hardware/contracts";

export type RegisterPosHardwareDeviceInput = {
  hardwareCatalogId: string;
  vendor: string;
  model: string;
  deviceType: PosHardwareDeviceType;
  serialNumber: string;
  provider?: string | null;
  providerDeviceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type AssignPosHardwareDeviceInput = {
  deviceId: string;
  locationId: string;
  role: string;
  stationKey?: string;
  replaceDeviceId?: string | null;
  metadata?: Record<string, unknown>;
};

export type PosHardwareDeviceRecord = {
  id: string;
  hardware_catalog_id: string;
  vendor: string;
  model: string;
  device_type: PosHardwareDeviceType;
  serial_number: string;
  provider: string | null;
  provider_device_id: string | null;
  lifecycle_status: string;
  health_status: PosHardwareHealth;
  firmware_version: string | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
};

function required(value: string, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`missing_${field}`);
  return normalized;
}

export async function registerPosHardwareDevice(
  input: RegisterPosHardwareDeviceInput,
): Promise<PosHardwareDeviceRecord> {
  const hardwareCatalogId = required(input.hardwareCatalogId, "hardware_catalog_id");
  const certified = getCertifiedHardware(hardwareCatalogId);
  if (!certified) throw new Error("uncertified_pos_hardware");
  if (
    certified.vendor !== required(input.vendor, "vendor") ||
    certified.model !== required(input.model, "model") ||
    certified.deviceType !== input.deviceType
  ) {
    throw new Error("pos_hardware_catalog_identity_mismatch");
  }

  const row = {
    hardware_catalog_id: hardwareCatalogId,
    vendor: certified.vendor,
    model: certified.model,
    device_type: certified.deviceType,
    serial_number: required(input.serialNumber, "serial_number"),
    provider: input.provider?.trim() || null,
    provider_device_id: input.providerDeviceId?.trim() || null,
    metadata: input.metadata || {},
  };

  const { data, error } = await supabaseAdmin
    .from("pos_hardware_devices")
    .upsert(row, { onConflict: "vendor,serial_number" })
    .select("*")
    .single();

  if (error) throw new Error(`pos_hardware_register_failed:${error.message}`);
  return data as PosHardwareDeviceRecord;
}

export async function assignPosHardwareDevice(
  input: AssignPosHardwareDeviceInput,
): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("pos_assign_hardware_device", {
    p_device_id: required(input.deviceId, "device_id"),
    p_location_id: required(input.locationId, "location_id"),
    p_role: required(input.role, "role"),
    p_station_key: input.stationKey?.trim() || "default",
    p_replace_device_id: input.replaceDeviceId || null,
    p_metadata: input.metadata || {},
  });

  if (error) throw new Error(`pos_hardware_assign_failed:${error.message}`);
  return String(data || "");
}

export async function recordPosHardwareHeartbeat(input: {
  deviceId: string;
  healthStatus: PosHardwareHealth;
  firmwareVersion?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { error } = await supabaseAdmin.rpc("pos_record_hardware_heartbeat", {
    p_device_id: required(input.deviceId, "device_id"),
    p_health_status: input.healthStatus,
    p_firmware_version: input.firmwareVersion?.trim() || null,
    p_metadata: input.metadata || {},
  });

  if (error) throw new Error(`pos_hardware_heartbeat_failed:${error.message}`);
}

export type PosLocationHardware = PosHardwareAssignment & {
  stationKey: string;
  device: PosHardwareDeviceRecord;
};

export async function listLocationHardware(locationId: string) {
  const normalizedLocationId = required(locationId, "location_id");
  const { data: assignments, error: assignmentError } = await supabaseAdmin
    .from("pos_hardware_assignments")
    .select("id,device_id,location_id,role,station_key,replacement_for_device_id,assigned_at,metadata")
    .eq("location_id", normalizedLocationId)
    .eq("assignment_status", "active")
    .order("role", { ascending: true })
    .order("station_key", { ascending: true });

  if (assignmentError) {
    throw new Error(`pos_hardware_list_assignments_failed:${assignmentError.message}`);
  }

  const deviceIds = (assignments || []).map((row) => String(row.device_id));
  if (!deviceIds.length) return [] as PosLocationHardware[];

  const { data: devices, error: deviceError } = await supabaseAdmin
    .from("pos_hardware_devices")
    .select("*")
    .in("id", deviceIds);

  if (deviceError) {
    throw new Error(`pos_hardware_list_devices_failed:${deviceError.message}`);
  }

  const deviceById = new Map(
    (devices || []).map((device) => [String(device.id), device as PosHardwareDeviceRecord]),
  );

  return (assignments || [])
    .map((assignment) => {
      const device = deviceById.get(String(assignment.device_id));
      if (!device) return null;
      return {
        deviceId: String(assignment.device_id),
        locationId: String(assignment.location_id),
        role: String(assignment.role),
        hardwareId: device.hardware_catalog_id,
        serialNumber: device.serial_number,
        stationKey: String(assignment.station_key || "default"),
        replacementForDeviceId: assignment.replacement_for_device_id
          ? String(assignment.replacement_for_device_id)
          : null,
        device,
      };
    })
    .filter(Boolean) as PosLocationHardware[];
}
