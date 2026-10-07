"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { provisionPosInventoryDevices } from "@/lib/pos-hardware-inventory";

export async function provisionPosInventoryCartAction(formData: FormData) {
  await requireAdminRole(["superadmin", "admin"]);

  const locationId = String(formData.get("locationId") || "").trim();
  const rawAssignments = String(formData.get("assignments") || "[]");

  let assignments: Array<{ deviceId: string; role: string; stationKey?: string }>;
  try {
    const parsed = JSON.parse(rawAssignments);
    assignments = Array.isArray(parsed)
      ? parsed.map((item) => ({
          deviceId: String(item?.deviceId || ""),
          role: String(item?.role || ""),
          stationKey: String(item?.stationKey || "default"),
        }))
      : [];
  } catch {
    throw new Error("pos_inventory_assignment_invalid_cart");
  }

  const provisioned = await provisionPosInventoryDevices({
    locationId,
    assignments,
  });

  revalidatePath("/admin/dashboard/settings/location-tools/pos-hardware/inventory");
  revalidatePath("/admin/dashboard/settings/location-tools/pos-hardware/assign");
  redirect(
    `/admin/dashboard/settings/location-tools/pos-hardware/assign?assigned=${provisioned.length}&locationId=${encodeURIComponent(locationId)}`,
  );
}
