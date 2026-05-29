type AuthUserLike = {
  id: string;
  email?: string | null;
};

export type AdminLoginRole = "admin" | "superadmin" | null;

function normalizeAdminLoginRole(role: unknown): AdminLoginRole {
  const normalized =
    role === "superuser" || role === "super_admin" ? "superadmin" : role;

  if (normalized === "admin" || normalized === "superadmin") {
    return normalized;
  }

  return null;
}

export async function getAdminLoginRole(
  supabase: any,
  user: AuthUserLike | null | undefined,
): Promise<AdminLoginRole> {
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("getAdminLoginRole failed", {
      userId: user.id,
      email: user.email,
      message: error.message,
    });
    return null;
  }

  return normalizeAdminLoginRole(data?.role);
}
