type AuthUserLike = {
  id: string;
  email?: string | null;
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
};

export type AdminLoginRole = "admin" | "superadmin" | "manager" | null;

function normalizeAdminLoginRole(role: unknown): AdminLoginRole {
  const normalized =
    typeof role === "string"
      ? role.trim().toLowerCase().replace(/\s+/g, "_")
      : role;
  const mapped =
    normalized === "superuser" || normalized === "super_admin"
      ? "superadmin"
      : normalized;

  if (mapped === "admin" || mapped === "superadmin" || mapped === "manager") {
    return mapped;
  }

  return null;
}

function roleFromMetadata(user: AuthUserLike | null | undefined): AdminLoginRole {
  return (
    normalizeAdminLoginRole(user?.app_metadata?.role) ??
    normalizeAdminLoginRole(user?.user_metadata?.role) ??
    normalizeAdminLoginRole(user?.app_metadata?.admin_role) ??
    normalizeAdminLoginRole(user?.user_metadata?.admin_role)
  );
}

async function authAdminRoleFromSupabase(supabase: any, userId: string) {
  try {
    const { data } = await supabase.auth.admin.getUserById(userId);
    const user = data?.user as AuthUserLike | null | undefined;
    return roleFromMetadata(user);
  } catch {
    return null;
  }
}

export async function getAdminLoginRole(
  supabase: any,
  user: AuthUserLike | null | undefined,
): Promise<AdminLoginRole> {
  if (!user?.id) return null;

  const directMetadataRole = roleFromMetadata(user);
  if (directMetadataRole) return directMetadataRole;

  const authMetadataRole = await authAdminRoleFromSupabase(supabase, user.id);
  if (authMetadataRole) return authMetadataRole;

  const { data, error } = await supabase
    .from("admin_users")
    .select("role,email,user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const roleByUserId = normalizeAdminLoginRole(data?.role);
  if (roleByUserId) return roleByUserId;

  if (user.email) {
    const { data: byEmail, error: emailError } = await supabase
      .from("admin_users")
      .select("role,email,user_id")
      .ilike("email", user.email)
      .limit(1)
      .maybeSingle();

    const roleByEmail = normalizeAdminLoginRole(byEmail?.role);
    if (roleByEmail) {
      if (byEmail?.user_id !== user.id) {
        await supabase
          .from("admin_users")
          .update({ user_id: user.id })
          .ilike("email", user.email)
          .is("user_id", null);
      }
      return roleByEmail;
    }

    if (emailError) {
      console.error("getAdminLoginRole email lookup failed", {
        userId: user.id,
        email: user.email,
        message: emailError.message,
      });
    }
  }

  if (error) {
    console.error("getAdminLoginRole failed", {
      userId: user.id,
      email: user.email,
      message: error.message,
    });
  }

  return null;
}
