"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { provisionPosInventoryDevices } from "@/lib/pos-hardware-inventory";

export async function provisionPosInventoryCartAction(formData: FormData) {
  await requireAdminRole(["superadmin", "admin"]);

  const locationId = String(formData.get("locationId") || "").trim();
  const rawDeviceIds = String(formData.get("deviceIds") || "[]");

  let deviceIds: string[];
  try {
    const parsed = JSON.parse(rawDeviceIds);
    deviceIds = Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    throw new Error("pos_inventory_assignment_invalid_cart");
  }

  const provisioned = await provisionPosInventoryDevices({
    locationId,
    deviceIds,
  });

  revalidatePath("/admin/dashboard/settings/location-tools/pos-hardware/inventory");
  revalidatePath("/admin/dashboard/settings/location-tools/pos-hardware/assign");
  redirect(
    `/admin/dashboard/settings/location-tools/pos-hardware/assign?assigned=${provisioned.length}&locationId=${encodeURIComponent(locationId)}`,
  );
}
