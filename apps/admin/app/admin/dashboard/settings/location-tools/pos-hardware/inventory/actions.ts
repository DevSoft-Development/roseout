"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { receivePosInventoryDevice } from "../../../../../lib/pos-hardware-inventory";

export async function receivePosInventoryAction(formData: FormData) {
  await requireAdminRole(["superadmin", "admin"]);

  const result = await receivePosInventoryDevice({
    hardwareCatalogId: String(formData.get("hardwareCatalogId") || ""),
    serialNumber: String(formData.get("serialNumber") || ""),
  });

  revalidatePath("/admin/dashboard/settings/location-tools/pos-hardware/inventory");
  redirect(
    `/admin/dashboard/settings/location-tools/pos-hardware/inventory?received=${encodeURIComponent(result.device.id)}&created=${result.created ? "1" : "0"}`,
  );
}
