import "server-only";

import { unstable_cache } from "next/cache";
import { getAdminSaasAnalytics, type AdminSaasAnalytics } from "@/lib/admin/analytics/getAdminSaasAnalytics";

const readCachedAdminSaasAnalytics = unstable_cache(
  async (): Promise<AdminSaasAnalytics> => getAdminSaasAnalytics(),
  ["admin-saas-analytics-v1"],
  { revalidate: 30 },
);

export async function getCachedAdminSaasAnalytics(): Promise<AdminSaasAnalytics> {
  return readCachedAdminSaasAnalytics();
}
