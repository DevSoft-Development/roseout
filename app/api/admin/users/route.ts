import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";

import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
type AuthAdminUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

async function findAuthUserByEmail(email: string) {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw error;
  return data.users.find((user) => user.email?.toLowerCase() === email) || null;
}

function getAuthFullName(user: AuthAdminUser | null) {
  const metadata = user?.user_metadata || {};
  if (typeof metadata.full_name === "string") return metadata.full_name;
  if (typeof metadata.name === "string") return metadata.name;
  return null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("customer") === "1") {
    const { listAdminUsers } = await import("@/lib/admin-users");
    return Response.json({ success: true, ...(await listAdminUsers(Object.fromEntries(url.searchParams))) });
  }

  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.adminUsers);

  if (error) return error;

  const [adminUsersResult, authUsersResult] = await Promise.all([
    supabaseAdmin
      .from("admin_users")
      .select("user_id, role, created_at")
      .order("created_at", { ascending: false }),
    supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (adminUsersResult.error) {
    return Response.json({ error: adminUsersResult.error.message }, { status: 500 });
  }

  if (authUsersResult.error) {
    return Response.json({ error: authUsersResult.error.message }, { status: 500 });
  }

  const authUsersById = new Map(authUsersResult.data.users.map((user) => [user.id, user]));
  const users = (adminUsersResult.data || []).map((adminUser) => {
    const authUser = authUsersById.get(adminUser.user_id);
    return {
      user_id: adminUser.user_id,
      email: authUser?.email ?? null,
      full_name: getAuthFullName(authUser as AuthAdminUser | null),
      role: normalizeRole(adminUser.role),
      created_at: adminUser.created_at,
    };
  });

  return Response.json({ users });
}

export async function POST(req: Request) {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.adminUsers);

  if (error) return error;

  try {
    const body = await req.json();
    const email = String(body.email || "").trim().toLowerCase();
    const role = normalizeRole(String(body.role || "editor"));

    if (!email) {
      return Response.json({ error: "Email is required." }, { status: 400 });
    }

    if (!isAdminRole(role)) {
      return Response.json({ error: "Invalid role." }, { status: 400 });
    }

    const authUser = await findAuthUserByEmail(email);

    if (!authUser) {
      return Response.json({ error: "Auth user not found for that email." }, { status: 404 });
    }

    const { data: existing } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (existing) {
      return Response.json({ error: "User already exists." }, { status: 400 });
    }

    const { error: insertError } = await supabaseAdmin
      .from("admin_users")
      .insert({
        user_id: authUser.id,
        role,
      });

    if (insertError) {
      return Response.json({ error: insertError.message }, { status: 500 });
    }

    return Response.json({ success: true, message: "Admin user created." });
  } catch (err: any) {
    return Response.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.adminUsers);

  if (error) return error;

  try {
    const body = await req.json();
    const userId = body.user_id || body.id;
    const rawRole = body.role;

    if (!userId || !rawRole) {
      return Response.json({ error: "Missing user id or role." }, { status: 400 });
    }

    const role = normalizeRole(rawRole);

    if (!isAdminRole(role)) {
      return Response.json({ error: "Invalid role." }, { status: 400 });
    }

    const { data: targetUser } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!targetUser) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (targetUser.user_id === adminUser?.user_id) {
      return Response.json({ error: "You cannot change your own role." }, { status: 400 });
    }

    const { error: updateError } = await supabaseAdmin
      .from("admin_users")
      .update({ role })
      .eq("user_id", userId);

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 });
    }

    return Response.json({ success: true, message: "User role updated." });
  } catch (err: any) {
    return Response.json({ error: err.message || "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.adminUsers);

  if (error) return error;

  try {
    const body = await req.json();
    const userId = body.user_id || body.id;

    if (!userId) {
      return Response.json({ error: "Missing user id." }, { status: 400 });
    }

    const { data: targetUser } = await supabaseAdmin
      .from("admin_users")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!targetUser) {
      return Response.json({ error: "User not found." }, { status: 404 });
    }

    if (targetUser.user_id === adminUser?.user_id) {
      return Response.json({ error: "You cannot delete yourself." }, { status: 400 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("admin_users")
      .delete()
      .eq("user_id", userId);

    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 });
    }

    return Response.json({ success: true, message: "User removed." });
  } catch (err: any) {
    return Response.json({ error: err.message || "Server error" }, { status: 500 });
  }
}
