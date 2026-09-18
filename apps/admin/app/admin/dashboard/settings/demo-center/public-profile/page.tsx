import { redirect } from "next/navigation";

import { requireAdminRole } from "@theouthaven/auth/admin-session";
import { ADMIN_ROLES } from "@theouthaven/auth/admin-roles";
import { getMirrorDemoLocation } from "@/lib/demo/demo-center";

export const dynamic = "force-dynamic";

export default async function DemoPublicProfilePreview() {
  await requireAdminRole(ADMIN_ROLES);
  const location = await getMirrorDemoLocation();

  if (!location?.id) {
    redirect("/admin/dashboard/settings/demo-center");
  }

  const rawType = String(
    location.location_type || location.type || "restaurant",
  ).toLowerCase();
  const type = rawType.includes("activ") ? "activity" : "restaurant";

  const consumerOrigin = String(
    process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com",
  ).replace(/\/$/, "");

  redirect(
    `${consumerOrigin}/locations/${type}/${location.id}?adminLocationId=${location.id}&locationId=${location.id}&type=${type}&demo=1&fromDemoCenter=1`,
  );
}
