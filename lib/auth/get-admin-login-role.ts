type AuthUserLike = {
  id: string;
  email?: string | null;
};

export type AdminLoginRole = "admin" | "superadmin" | "manager" | null;

function normalizeAdminLoginRole(role: unknown): AdminLoginRole {
  const normalized =
    role === "superuser" || role === "super_admin" ? "superadmin" : role;

  if (normalized === "admin" || normalized === "superadmin" || normalized === "manager") {
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
    .select("role,email,user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const roleByUserId = normalizeAdminLoginRole(data?.role);
  if (roleByUserId) return roleByUserId;

  if (user.email) {
    const { data: byEmail, error: emailError } = await supabase
      .from("admin_users")
      .select("role,email,user_id")
      .eq("email", user.email)
      .maybeSingle();

    const roleByEmail = normalizeAdminLoginRole(byEmail?.role);
    if (roleByEmail) {
      if (byEmail?.user_id !== user.id) {
        await supabase
          .from("admin_users")
          .update({ user_id: user.id })
          .eq("email", user.email)
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
