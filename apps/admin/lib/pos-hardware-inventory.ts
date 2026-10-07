import "server-only";

import QRCode from "qrcode";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";
import { POS_CERTIFIED_HARDWARE_DATA } from "@theouthaven/config/pos-hardware-catalog";

const POS_CERTIFIED_HARDWARE = POS_CERTIFIED_HARDWARE_DATA;

function getCertifiedHardware(id: string) {
  return POS_CERTIFIED_HARDWARE.find((item) => item.id === id) || null;
}

export type AdminPosInventoryDevice = {
  id: string;
  hardware_catalog_id: string;
  vendor: string;
  model: string;
  device_type: string;
  serial_number: string;
  lifecycle_status: string;
  health_status: string;
  firmware_version: string | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

function required(value: unknown, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`pos_inventory_missing_${field}`);
  return normalized;
}

export function posInventoryAssetTag(deviceId: string) {
  const normalized = required(deviceId, "device_id").replace(/-/g, "").toUpperCase();
  return `TPH-${normalized.slice(0, 10)}`;
}

export function posInventoryQrPayload(deviceId: string) {
  return `theposhaven://inventory/${required(deviceId, "device_id")}`;
}

export async function receivePosInventoryDevice(input: {
  hardwareCatalogId: string;
  serialNumber: string;
}) {
  const hardwareCatalogId = required(input.hardwareCatalogId, "hardware_catalog_id");
  const serialNumber = required(input.serialNumber, "serial_number");
  const certified = getCertifiedHardware(hardwareCatalogId);
  if (!certified) throw new Error("uncertified_pos_hardware");

  const db = getAdminDatabaseClient();
  const { data: existing, error: existingError } = await db
    .from("pos_hardware_devices")
    .select("*")
    .eq("vendor", certified.vendor)
    .eq("serial_number", serialNumber)
    .maybeSingle();

  if (existingError) {
    throw new Error(`pos_inventory_lookup_failed:${existingError.message}`);
  }

  if (existing) {
    return {
      device: existing as AdminPosInventoryDevice,
      created: false,
    };
  }

  const { data: created, error: createError } = await db
    .from("pos_hardware_devices")
    .insert({
      hardware_catalog_id: certified.id,
      vendor: certified.vendor,
      model: certified.model,
      device_type: certified.deviceType,
      serial_number: serialNumber,
      lifecycle_status: "inventory",
      health_status: "unknown",
      metadata: {
        receiving_mode: "manufacturer_serial_scan",
      },
    })
    .select("*")
    .single();

  if (createError || !created) {
    throw new Error(`pos_inventory_receive_failed:${createError?.message || "missing_device"}`);
  }

  const assetTag = posInventoryAssetTag(String(created.id));
  const qrPayload = posInventoryQrPayload(String(created.id));
  const currentMetadata =
    created.metadata && typeof created.metadata === "object" && !Array.isArray(created.metadata)
      ? created.metadata as Record<string, unknown>
      : {};

  const { data: labeled, error: labelError } = await db
    .from("pos_hardware_devices")
    .update({
      metadata: {
        ...currentMetadata,
        asset_tag: assetTag,
        qr_payload: qrPayload,
        qr_version: 1,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", created.id)
    .select("*")
    .single();

  if (labelError || !labeled) {
    throw new Error(`pos_inventory_label_failed:${labelError?.message || "missing_device"}`);
  }

  return {
    device: labeled as AdminPosInventoryDevice,
    created: true,
  };
}

export async function listPosInventoryDevices(limit = 100) {
  const db = getAdminDatabaseClient();
  const { data, error } = await db
    .from("pos_hardware_devices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 250));

  if (error) throw new Error(`pos_inventory_list_failed:${error.message}`);
  return (data || []) as AdminPosInventoryDevice[];
}

export async function renderPosInventoryQrDataUrl(deviceId: string) {
  return QRCode.toDataURL(posInventoryQrPayload(deviceId), {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
  });
}

export const POS_RECEIVING_CATALOG = POS_CERTIFIED_HARDWARE.map((item) => ({
  id: item.id,
  label: `${item.vendor} ${item.model}`,
  deviceType: item.deviceType,
}));


export function parsePosInventoryQrPayload(value: string) {
  const normalized = String(value || "").trim();
  const match = normalized.match(
    /^theposhaven:\/\/inventory\/([0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  );
  return match?.[1] || null;
}

export async function listAssignablePosInventoryDevices() {
  const db = getAdminDatabaseClient();
  const { data, error } = await db
    .from("pos_hardware_devices")
    .select("*")
    .in("lifecycle_status", ["inventory", "provisioned"])
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) throw new Error(`pos_inventory_assignable_list_failed:${error.message}`);
  return (data || []) as AdminPosInventoryDevice[];
}

export async function listPosProvisioningLocations(limit = 500) {
  const db = getAdminDatabaseClient();
  const { data, error } = await db
    .from("locations")
    .select("id,name,restaurant_name,activity_name,address,city,state")
    .order("name", { ascending: true, nullsFirst: false })
    .limit(Math.min(Math.max(limit, 1), 1000));

  if (error) throw new Error(`pos_inventory_location_list_failed:${error.message}`);
  return (data || []).map((row) => ({
    id: String(row.id),
    name:
      String(row.name || row.restaurant_name || row.activity_name || "").trim() ||
      "Unnamed location",
    address: [row.address, row.city, row.state].filter(Boolean).join(", "),
  }));
}

export async function provisionPosInventoryDevices(input: {
  locationId: string;
  deviceIds: string[];
}) {
  const locationId = required(input.locationId, "location_id");
  const deviceIds = Array.from(
    new Set(
      input.deviceIds
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (!deviceIds.length) throw new Error("pos_inventory_assignment_empty");
  if (deviceIds.length > 100) throw new Error("pos_inventory_assignment_too_large");

  const db = getAdminDatabaseClient();

  const { data: location, error: locationError } = await db
    .from("locations")
    .select("id")
    .eq("id", locationId)
    .maybeSingle();

  if (locationError || !location) {
    throw new Error("pos_inventory_assignment_location_not_found");
  }

  const { data: devices, error: deviceError } = await db
    .from("pos_hardware_devices")
    .select("*")
    .in("id", deviceIds);

  if (deviceError) {
    throw new Error(`pos_inventory_assignment_lookup_failed:${deviceError.message}`);
  }

  if ((devices || []).length !== deviceIds.length) {
    throw new Error("pos_inventory_assignment_device_not_found");
  }

  const invalid = (devices || []).find(
    (device) => !["inventory", "provisioned"].includes(String(device.lifecycle_status)),
  );
  if (invalid) {
    throw new Error(`pos_inventory_assignment_device_unavailable:${invalid.id}`);
  }

  const { data: activeAssignments, error: assignmentError } = await db
    .from("pos_hardware_assignments")
    .select("device_id")
    .in("device_id", deviceIds)
    .eq("assignment_status", "active");

  if (assignmentError) {
    throw new Error(`pos_inventory_assignment_active_lookup_failed:${assignmentError.message}`);
  }
  if ((activeAssignments || []).length) {
    throw new Error("pos_inventory_assignment_device_already_active");
  }

  const provisionedAt = new Date().toISOString();
  const results: AdminPosInventoryDevice[] = [];

  for (const device of devices || []) {
    const metadata =
      device.metadata && typeof device.metadata === "object" && !Array.isArray(device.metadata)
        ? device.metadata as Record<string, unknown>
        : {};

    const { data: updated, error: updateError } = await db
      .from("pos_hardware_devices")
      .update({
        lifecycle_status: "provisioned",
        metadata: {
          ...metadata,
          pre_enrolled_location_id: locationId,
          intended_location_id: locationId,
          provisioned_at: provisionedAt,
          provisioning_mode: "admin_qr_assignment_cart",
        },
        updated_at: provisionedAt,
      })
      .eq("id", device.id)
      .in("lifecycle_status", ["inventory", "provisioned"])
      .select("*")
      .single();

    if (updateError || !updated) {
      throw new Error(
        `pos_inventory_assignment_update_failed:${device.id}:${updateError?.message || "missing_device"}`,
      );
    }

    results.push(updated as AdminPosInventoryDevice);
  }

  return results;
}
