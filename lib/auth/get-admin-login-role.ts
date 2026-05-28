type SupabaseLike = {
  from: (table: string) => {
    select: (columns?: string) => {
      eq: (column: string, value: unknown) => {
        maybeSingle: () => Promise<{
          data: any;
          error: any;
        }>;
        single?: () => Promise<{
          data: any;
          error: any;
        }>;
      };
    };
  };
};

type AuthUserLike = {
  id: string;
  email?: string | null;
};

type AdminLoginRole = "admin" | "superadmin" | null;

function normalizeAdminLoginRole(role: unknown): AdminLoginRole {
  const normalizedRole = role === "superuser" ? "superadmin" : role;

  if (normalizedRole === "admin" || normalizedRole === "superadmin") {
    return normalizedRole;
  }

  return null;
}

async function findAdminRoleByColumn(supabase: SupabaseLike, column: string, value: string) {
  return supabase.from("admin_users").select("role").eq(column, value).maybeSingle();
}

export async function getAdminLoginRole(
  supabase: SupabaseLike,
  user: AuthUserLike | null | undefined,
): Promise<AdminLoginRole> {
  if (!user?.id) return null;

  const { data, error } = await findAdminRoleByColumn(supabase, "user_id", user.id);
  const roleFromUserId = normalizeAdminLoginRole(data?.role);

  if (!error && roleFromUserId) {
    return roleFromUserId;
  }

  const email = user.email?.toLowerCase();
  if (!email) return null;

  const { data: emailData, error: emailError } = await findAdminRoleByColumn(supabase, "email", email);

  if (emailError) return null;

  return normalizeAdminLoginRole(emailData?.role);
}
