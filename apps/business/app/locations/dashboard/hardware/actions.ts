"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase-server";
import {
  hasLocationPermission,
  resolveLocationAccessContext,
} from "@/lib/auth/locationOwnerAccess";
import { getCertifiedHardware } from "@/lib/pos/hardware/catalog";
import {
  assignPosHardwareDevice,
  listLocationHardware,
} from "@/lib/pos/hardware/device-registry";

function required(value: FormDataEntryValue | null, field: string) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`missing_${field}`);
  return normalized;
}

export async function updateBusinessHardwareRole(formData: FormData) {
  const locationId = required(formData.get("locationId"), "location_id");
  const deviceId = required(formData.get("deviceId"), "device_id");
  const role = required(formData.get("role"), "role");

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
    !access.canonicalLocationId ||
    access.canonicalLocationId !== locationId ||
    !hasLocationPermission(access, "hardware.manage")
  ) {
    throw new Error("hardware_management_forbidden");
  }

  const hardware = await listLocationHardware(locationId);
  const current = hardware.find((item) => item.deviceId === deviceId);
  if (!current) throw new Error("hardware_device_not_assigned_to_location");

  const certified = getCertifiedHardware(current.hardwareId);
  const allowedRoles = certified?.supportedPrinterRoles || [];
  if (!allowedRoles.includes(role as never)) {
    throw new Error("hardware_role_not_supported");
  }

  await assignPosHardwareDevice({
    deviceId,
    locationId,
    role,
    stationKey: current.stationKey,
    metadata: {
      managed_from: "business_portal",
      changed_by_user_id: user.id,
    },
  });

  revalidatePath("/locations/dashboard/hardware");
  revalidatePath(`/locations/dashboard/hardware/${deviceId}`);
}
