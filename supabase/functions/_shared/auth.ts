import type { SupabaseClient, User } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const ADMIN_ROLES = new Set(["superadmin", "admin", "experience_team", "sales_ambassador", "support"]);

export function readBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function getUserFromRequest(req: Request, supabase: SupabaseClient): Promise<User | null> {
  const token = readBearerToken(req);
  if (!token) return null;
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user ?? null;
}

function roleFromUser(user: User | null): string | null {
  const appRole = (user?.app_metadata as Record<string, unknown> | undefined)?.role;
  const userRole = (user?.user_metadata as Record<string, unknown> | undefined)?.role;
  return String(appRole ?? userRole ?? "").toLowerCase() || null;
}

async function roleFromTable(supabase: SupabaseClient, table: string, userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from(table).select("role").eq("user_id", userId).maybeSingle();
    if (error || !data?.role) return null;
    return String(data.role).toLowerCase();
  } catch {
    return null;
  }
}

export async function requireAdmin(req: Request, supabase: SupabaseClient): Promise<{ user: User; role: string }> {
  const user = await getUserFromRequest(req, supabase);
  if (!user) throw new Error("UNAUTHORIZED: valid user JWT required");
  const directRole = roleFromUser(user);
  if (directRole && ADMIN_ROLES.has(directRole)) return { user, role: directRole };
  for (const table of ["profiles", "admin_users"]) {
    const tableRole = await roleFromTable(supabase, table, user.id);
    if (tableRole && ADMIN_ROLES.has(tableRole)) return { user, role: tableRole };
  }
  throw new Error("FORBIDDEN: admin role required");
}

export function requireCronSecret(req: Request): { source: "cron" } {
  const expected = Deno.env.get("CRON_SECRET");
  if (!expected) throw new Error("SERVER_ERROR: CRON_SECRET env var is required for cron functions");
  const received = req.headers.get("x-cron-secret") || "";
  if (received !== expected) throw new Error("FORBIDDEN: invalid or missing x-cron-secret");
  return { source: "cron" };
}

export async function requireAdminOrCron(req: Request, supabase: SupabaseClient): Promise<{ source: "admin" | "cron"; user?: User; role?: string }> {
  const expected = Deno.env.get("CRON_SECRET");
  const received = req.headers.get("x-cron-secret") || "";
  if (expected && received === expected) return { source: "cron" };
  const admin = await requireAdmin(req, supabase);
  return { source: "admin", user: admin.user, role: admin.role };
}
