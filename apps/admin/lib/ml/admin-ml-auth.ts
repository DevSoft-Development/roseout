import "server-only";

import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { resolveSearchMlRuntimeConfig } from "@/lib/search/ml-runtime-config";

const SEARCH_HEALTH_ROLES = new Set(["superadmin", "admin", "experience_team"]);

function bearer(request: Request) {
  const header = request.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : null;
}

function response(status: number, error: string) {
  return Response.json({ success: false, error }, { status });
}

async function adminForRoles(allowed: ReadonlySet<string>) {
  const admin = await getCurrentAdminOrNull();
  if (!admin) return response(401, "Unauthorized.");
  if (!allowed.has(admin.role)) return response(403, "Forbidden.");
  return null;
}

export async function authorizeReviewMlRequest(request: Request) {
  if (process.env.NODE_ENV === "development") return null;
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && bearer(request) === cronSecret) return null;
  return adminForRoles(SEARCH_HEALTH_ROLES);
}

export async function authorizeSearchHealthMlRequest(request: Request) {
  if (process.env.NODE_ENV === "development" || isCronRequestAuthorized(request)) return null;
  const config = await resolveSearchMlRuntimeConfig().catch(() => null);
  if (config?.token && request.headers.get("authorization") === `Bearer ${config.token}`) return null;
  return adminForRoles(SEARCH_HEALTH_ROLES);
}

export async function authorizeAdvancedMlRequest(request: Request) {
  if (isCronRequestAuthorized(request)) return null;
  const config = await resolveSearchMlRuntimeConfig().catch(() => null);
  if (config?.token && request.headers.get("authorization") === `Bearer ${config.token}`) return null;
  return adminForRoles(new Set(["superadmin"]));
}
