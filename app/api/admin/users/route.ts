import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";

//
// GET → list admin users
//
export async function GET() {
  const { error, supabase } = await requireAdminApiRole([
    "superadmin",
    "admin",
  ]);

  if (error) return error;

  const { data, error: fetchError } = await supabase
    .from("admin_users")
    .select("id, email, full_name, role, created_at")
    .order("created_at", { ascending: false });

  if (fetchError) {
    return Response.json(
      { error: fetchError.message },
      { status: 500 }
    );
  }

  return Response.json({ users: data || [] });
}

//
// POST → create admin user (superadmin only)
//
export async function POST(req: Request) {
  const { error, supabase, adminUser } = await requireAdminApiRole([
    "superadmin",
  ]);

  if (error) return error;

  try {
    const body = await req.json();

    const email = body.email?.trim().toLowerCase();
    const fullName = body.full_name?.trim() || null;
    const role = normalizeRole(body.role || "editor");

    if (!email) {
      return Response.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    if (!isAdminRole(role)) {
      return Response.json(
        { error: "Invalid role." },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("admin_users")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existing) {
      return Response.json(
        { error: "User already exists." },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase
      .from("admin_users")
      .insert({
        email,
        full_name: fullName,
        role,
      });

    if (insertError) {
      return Response.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "Admin user created.",
    });
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}

//
// PATCH → update role (superadmin only)
//
export async function PATCH(req: Request) {
  const { error, supabase, adminUser } = await requireAdminApiRole([
    "superadmin",
  ]);

  if (error) return error;

  try {
    const body = await req.json();

    const id = body.id;
    const rawRole = body.role;

    if (!id || !rawRole) {
      return Response.json(
        { error: "Missing id or role." },
        { status: 400 }
      );
    }

    const role = normalizeRole(rawRole);

    if (!isAdminRole(role)) {
      return Response.json(
        { error: "Invalid role." },
        { status: 400 }
      );
    }

    const { data: targetUser } = await supabase
      .from("admin_users")
      .select("email")
      .eq("id", id)
      .maybeSingle();

    if (!targetUser) {
      return Response.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    // 🚨 Prevent self-demotion
    if (targetUser.email === adminUser.email) {
      return Response.json(
        { error: "You cannot change your own role." },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabase
      .from("admin_users")
      .update({ role })
      .eq("id", id);

    if (updateError) {
      return Response.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "User role updated.",
    });
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}

//
// DELETE → remove admin user (superadmin only)
//
export async function DELETE(req: Request) {
  const { error, supabase, adminUser } = await requireAdminApiRole([
    "superadmin",
  ]);

  if (error) return error;

  try {
    const body = await req.json();
    const id = body.id;

    if (!id) {
      return Response.json(
        { error: "Missing user id." },
        { status: 400 }
      );
    }

    const { data: targetUser } = await supabase
      .from("admin_users")
      .select("email")
      .eq("id", id)
      .maybeSingle();

    if (!targetUser) {
      return Response.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    // 🚨 Prevent deleting yourself
    if (targetUser.email === adminUser.email) {
      return Response.json(
        { error: "You cannot delete yourself." },
        { status: 400 }
      );
    }

    const { error: deleteError } = await supabase
      .from("admin_users")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return Response.json(
        { error: deleteError.message },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      message: "User removed.",
    });
  } catch (err: any) {
    return Response.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}