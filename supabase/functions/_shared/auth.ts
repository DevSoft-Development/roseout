import { forbidden, serverError, unauthorized } from "./response.ts";

export function readBearerToken(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim() || null;
}

export async function getUserFromRequest(req: Request, supabase: any) {
  const token = readBearerToken(req);
  if (!token) return { user: null, error: "Missing bearer token" };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return { user: null, error: error?.message ?? "Invalid token" };
  return { user: data.user, error: null };
}

export function requireCronSecret(req: Request): Response | null {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) return serverError("CRON_SECRET is missing");
  const received = req.headers.get("x-cron-secret") ?? "";
  if (received !== expected) return unauthorized("Invalid cron secret");
  return null;
}

export async function requireAdmin(req: Request, supabase: any): Promise<{ user: any; response: Response | null }> {
  const { user, error } = await getUserFromRequest(req, supabase);
  if (!user) return { user: null, response: unauthorized(error ?? "Unauthorized") };

  const metadataRole = user.app_metadata?.role ?? user.user_metadata?.role;
  if (["superadmin", "admin", "experience_team", "sales_ambassador", "support"].includes(metadataRole)) {
    return { user, response: null };
  }

  try {
    const { data } = await supabase.rpc("is_admin_user", { user_id: user.id });
    if (data === true) return { user, response: null };
  } catch (_) {
    // Fall through to forbidden. Some projects may not have this helper until the migration is applied.
  }

  return { user, response: forbidden("Admin access required") };
}

export async function requireAdminOrCron(req: Request, supabase: any): Promise<{ user: any; response: Response | null; source: "admin" | "cron" }> {
  const cronHeader = req.headers.get("x-cron-secret");
  if (cronHeader) {
    const cronResponse = requireCronSecret(req);
    return { user: null, response: cronResponse, source: "cron" };
  }
  const admin = await requireAdmin(req, supabase);
  return { ...admin, source: "admin" };
}
