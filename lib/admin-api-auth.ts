import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import type { AdminRole } from "@/lib/users/roles";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";

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
  if (typeof role !== "string") return null;
  const normalized = normalizeRole(role);
  return isAdminRole(normalized) ? normalized : null;
}

function normalizeAllowedRoles(allowedRoles: readonly AdminRole[]) {
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

async function ensureAdminUser({
  userId,
  email,
  fullName,
  role,
}: {
  userId: string;
  email: string | null | undefined;
  fullName?: unknown;
  role: AdminRole;
}) {
  if (!email) {
    console.warn(
      "Skipping admin_users backfill because authenticated user has no email",
      {
        userId,
        role,
      },
    );
    return;
  }

  const { error } = await supabaseAdmin.from("admin_users").upsert(
    {
      user_id: userId,
      email,
      full_name: typeof fullName === "string" ? fullName : null,
      role,
    },
    { onConflict: "user_id" },
  );

  if (error) {
    console.error("Failed to backfill admin_users role", {
      userId,
      email,
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

export async function requireAdminApiRole(allowedRoles: readonly AdminRole[]) {
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

  const { data: adminUser, error: adminError } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, email, full_name, role")
    .eq("user_id", user.id)
    .maybeSingle();

  const adminUserRole = normalizeAdminRole(adminUser?.role);

  if (adminUser && adminUserRole && allowed.includes(adminUserRole)) {
    return {
      error: null,
      adminUser: buildAdminUser({
        userId: adminUser.user_id,
        email: adminUser.email,
        fullName: adminUser.full_name,
        role: adminUserRole,
      }),
      supabase,
    };
  }

  if (!adminUser && user.email) {
    const { data: adminUserByEmail } = await supabaseAdmin
      .from("admin_users")
      .select("user_id, email, full_name, role")
      .eq("email", user.email)
      .maybeSingle();

    const adminUserByEmailRole = normalizeAdminRole(adminUserByEmail?.role);

    if (
      adminUserByEmail &&
      adminUserByEmailRole &&
      allowed.includes(adminUserByEmailRole)
    ) {
      if (adminUserByEmail.user_id !== user.id) {
        const { error: updateError } = await supabaseAdmin
          .from("admin_users")
          .update({ user_id: user.id })
          .eq("email", user.email);

        if (updateError) {
          console.error(
            "Failed to refresh admin_users user_id from email lookup",
            {
              userId: user.id,
              email: user.email,
              error: updateError.message,
            },
          );
        }
      }

      return {
        error: null,
        adminUser: buildAdminUser({
          userId: user.id,
          email: adminUserByEmail.email,
          fullName: adminUserByEmail.full_name,
          role: adminUserByEmailRole,
        }),
        supabase,
      };
    }
  }

  if (!adminError && !adminUser) {
    const fallbackRole = await findFallbackRole(user.id);

    if (fallbackRole && allowed.includes(fallbackRole)) {
      await ensureAdminUser({
        userId: user.id,
        email: user.email,
        fullName: user.user_metadata?.full_name,
        role: fallbackRole,
      });

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


export async function requireSuperAdmin() {
  return requireAdminApiRole(["superadmin"]);
}

export function safeAdminError(action = "admin_action", status = 500) {
  return Response.json(
    { success: false, action, error: "Request could not be completed." },
    { status },
  );
}
