import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

type AdminRole = "admin" | "superadmin" | "editor" | "viewer";

type FallbackRoleLookup = {
  table: string;
  column: string;
};

const FALLBACK_ROLE_LOOKUPS: readonly FallbackRoleLookup[] = [
  { table: "profiles", column: "id" },
  { table: "user_profiles", column: "id" },
  { table: "user_profiles", column: "user_id" },
  { table: "users", column: "id" },
];

function normalizeAdminRole(role: unknown): AdminRole | null {
  const normalized = String(role || "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (normalized === "superuser" || normalized === "super-admin") {
    return "superadmin";
  }

  if (
    normalized === "admin" ||
    normalized === "superadmin" ||
    normalized === "editor" ||
    normalized === "viewer"
  ) {
    return normalized;
  }

  return null;
}

function normalizeAllowedRoles(allowedRoles: readonly string[]) {
  return allowedRoles
    .map((role) => normalizeAdminRole(role))
    .filter((role): role is AdminRole => Boolean(role));
}

function authJson(error: "Unauthorized" | "Forbidden", status: 401 | 403) {
  return Response.json({ success: false, error }, { status });
}

async function findFallbackRole(userId: string) {
  for (const lookup of FALLBACK_ROLE_LOOKUPS) {
    const { data, error } = await supabaseAdmin
      .from(lookup.table)
      .select("role")
      .eq(lookup.column, userId)
      .maybeSingle();

    if (error) {
      // Some deployments do not have every legacy table/column combination.
      // Keep probing the trusted app tables rather than treating absent schema
      // as authorization success.
      continue;
    }

    const role = normalizeAdminRole(data?.role);
    if (role) return role;
  }

  return null;
}

async function ensureAdminUser(userId: string, role: AdminRole) {
  if (role !== "admin" && role !== "superadmin") return;

  const { error } = await supabaseAdmin.from("admin_users").upsert(
    {
      user_id: userId,
      role,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Failed to backfill admin_users role", {
      userId,
      role,
      error: error.message,
    });
  }
}

function buildAdminUser({
  userId,
  email,
  fullName,
  role,
}: {
  userId: string;
  email?: string | null;
  fullName?: unknown;
  role: AdminRole;
}) {
  return {
    user_id: userId,
    email: email ?? null,
    full_name: typeof fullName === "string" ? fullName : null,
    role,
  };
}

export async function requireAdminApiRole(allowedRoles: readonly string[]) {
  const supabase = await createClient();
  const allowed = normalizeAllowedRoles(allowedRoles);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return {
      error: authJson("Unauthorized", 401),
      adminUser: null,
      supabase,
    };
  }

  const { data: adminUser, error: adminError } = await supabase
    .from("admin_users")
    .select("user_id, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const adminUserRole = normalizeAdminRole(adminUser?.role);

  if (adminUser && adminUserRole && allowed.includes(adminUserRole)) {
    return {
      error: null,
      adminUser: buildAdminUser({
        userId: adminUser.user_id,
        email: user.email,
        fullName: user.user_metadata?.full_name,
        role: adminUserRole,
      }),
      supabase,
    };
  }

  if (!adminError && !adminUser) {
    const fallbackRole = await findFallbackRole(user.id);

    if (fallbackRole && allowed.includes(fallbackRole)) {
      await ensureAdminUser(user.id, fallbackRole);

      return {
        error: null,
        adminUser: buildAdminUser({
          userId: user.id,
          email: user.email,
          fullName: user.user_metadata?.full_name,
          role: fallbackRole,
        }),
        supabase,
      };
    }
  }

  return {
    error: authJson("Forbidden", 403),
    adminUser: null,
    supabase,
  };
}
