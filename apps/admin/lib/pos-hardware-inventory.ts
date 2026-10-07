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
