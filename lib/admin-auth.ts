import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export type AdminRole =
  | "superuser"
  | "admin"
  | "editor"
  | "reviewer"
  | "viewer";

type AdminUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: AdminRole;
};

function isAdminRole(role: unknown): role is AdminRole {
  return (
    role === "superuser" ||
    role === "admin" ||
    role === "editor" ||
    role === "reviewer" ||
    role === "viewer"
  );
}

export function getMetadataAdminUser(user: {
  id: string;
  email?: string | null;
  user_metadata?: {
    role?: unknown;
    full_name?: unknown;
    name?: unknown;
  };
}): AdminUser | null {
  if (!user.email || !isAdminRole(user.user_metadata?.role)) {
    return null;
  }

  const metadataName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;

  return {
    id: user.id,
    email: user.email.toLowerCase(),
    full_name: metadataName,
    role: user.user_metadata.role,
  };
}

export async function getCurrentAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    redirect("/login");
  }

  const { data: adminUser } = await supabase
    .from("admin_users")
    .select("id, email, full_name, role")
    .eq("email", user.email.toLowerCase())
    .maybeSingle();

  if (adminUser) {
    return adminUser;
  }

  const metadataAdminUser = getMetadataAdminUser(user);

  if (!metadataAdminUser) {
    redirect("/login");
  }

  return metadataAdminUser;
}

export async function requireAdminRole(allowedRoles: AdminRole[]) {
  const adminUser = await getCurrentAdmin();

  if (!allowedRoles.includes(adminUser.role as AdminRole)) {
    redirect("/admin/unauthorized");
  }

  return adminUser;
}