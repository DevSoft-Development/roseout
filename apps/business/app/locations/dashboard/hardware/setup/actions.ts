"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import {
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { getCertifiedHardware } from "@/lib/pos/hardware/catalog";
import type {
  PosHardwareDeviceType,
  PosPrinterRole,
} from "@/lib/pos/hardware/contracts";
import {
  assignPosHardwareDevice,
  getPosHardwareDevice,
  isPosHardwarePreenrolledForLocation,
  listLocationHardware,
} from "@/lib/pos/hardware/device-registry";

function required(value: FormDataEntryValue | null, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`missing_${field}`);
  return normalized;
}

function defaultRoleForDeviceType(deviceType: PosHardwareDeviceType) {
  const roles: Partial<Record<PosHardwareDeviceType, string>> = {
    cashier_tablet: "register",
    payment_terminal: "payment",
    cash_drawer: "cash_drawer",
    barcode_scanner: "scanner",
    network_hub: "network",
    network_bridge: "network_bridge",
    kitchen_display: "kitchen_display",
  };
  return roles[deviceType] || null;
}

export async function claimBusinessHardwareDevice(formData: FormData) {
  const locationId = required(formData.get("locationId"), "location_id");
  const deviceId = required(formData.get("deviceId"), "device_id");
  const replaceDeviceId = String(formData.get("replaceDeviceId") || "").trim() || null;
  const requestedRole = String(formData.get("role") || "").trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("hardware_management_auth_required");

  const access = await resolveLocationAccessContext({
    userId: user.id,
    userEmail: user.email,
    locationId,
  });
  if (
    access.canonicalLocationId !== locationId ||
    !hasLocationPermission(access, "hardware.manage")
  ) {
    throw new Error("hardware_management_forbidden");
  }

  const candidate = await getPosHardwareDevice(deviceId);
  if (!candidate) throw new Error("hardware_device_not_found");
  if (!["inventory", "provisioned"].includes(candidate.lifecycle_status)) {
    throw new Error("hardware_device_not_available_for_claim");
  }
  if (!isPosHardwarePreenrolledForLocation(candidate, locationId)) {
    throw new Error("hardware_device_not_pre_enrolled_for_location");
  }

  const certified = getCertifiedHardware(candidate.hardware_catalog_id);
  if (!certified) throw new Error("uncertified_pos_hardware");

  const candidateMetadata =
    candidate.metadata && typeof candidate.metadata === "object"
      ? candidate.metadata
      : {};
  const intendedRole =
    typeof candidateMetadata.intended_role === "string"
      ? candidateMetadata.intended_role.trim()
      : "";
  const intendedStationKey =
    typeof candidateMetadata.intended_station_key === "string"
      ? candidateMetadata.intended_station_key.trim()
      : "";

  const locationHardware = await listLocationHardware(locationId);
  const hasThePosHavenHub = locationHardware.some(
    (item) =>
      item.device.device_type === "network_hub" &&
      !["retired", "lost", "replaced"].includes(String(item.device.lifecycle_status || "")),
  );
  if (certified.managedKit === false && !hasThePosHavenHub) {
    throw new Error("hardware_byoh_requires_pos_hub");
  }

  const replacing = replaceDeviceId
    ? locationHardware.find((item) => item.deviceId === replaceDeviceId)
    : null;

  let role: string;
  let stationKey = "default";

  if (replaceDeviceId) {
    if (!replacing) throw new Error("replacement_device_not_assigned_to_location");
    role = replacing.role;
    stationKey = replacing.stationKey;

    if (certified.supportedPrinterRoles?.length) {
      if (!certified.supportedPrinterRoles.includes(role as PosPrinterRole)) {
        throw new Error("replacement_hardware_role_incompatible");
      }
    } else if (candidate.device_type !== replacing.device.device_type) {
      throw new Error("replacement_hardware_type_incompatible");
    }
  } else if (intendedRole) {
    if (certified.supportedPrinterRoles?.length) {
      if (!certified.supportedPrinterRoles.includes(intendedRole as PosPrinterRole)) {
        throw new Error("hardware_preprovisioned_role_incompatible");
      }
    } else {
      const defaultRole = defaultRoleForDeviceType(candidate.device_type);
      if (!defaultRole || intendedRole !== defaultRole) {
        throw new Error("hardware_preprovisioned_role_incompatible");
      }
    }
    role = intendedRole;
    stationKey = intendedStationKey || "default";
  } else if (certified.supportedPrinterRoles?.length) {
    if (
      !requestedRole ||
      !certified.supportedPrinterRoles.includes(requestedRole as PosPrinterRole)
    ) {
      throw new Error("hardware_role_not_supported");
    }
    role = requestedRole;
  } else {
    const defaultRole = defaultRoleForDeviceType(candidate.device_type);
    if (!defaultRole) throw new Error("hardware_role_not_configured");
    role = defaultRole;
  }

  await assignPosHardwareDevice({
    deviceId,
    locationId,
    role,
    stationKey,
    replaceDeviceId,
    metadata: {
      claim_mode: "business_portal_qr",
      claimed_by_user_id: user.id,
    },
  });

  revalidatePath("/locations/dashboard/hardware");
  redirect(
    `/locations/dashboard/hardware?locationId=${encodeURIComponent(locationId)}&hardwareUpdated=1`,
  );
}
