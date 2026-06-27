import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
function bearer(req: NextRequest) { const h = req.headers.get("authorization") || ""; return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : null; }
export async function authorizeSearchLearning(req: NextRequest) {
  if (process.env.NODE_ENV === "development" || (process.env.CRON_SECRET && bearer(req) === process.env.CRON_SECRET)) return { error: null, adminUser: null };
  return await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
}
