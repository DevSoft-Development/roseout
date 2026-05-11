import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

function clean(value: FormDataEntryValue | null) {
  return String(value || "").trim();
}

export async function POST(request: Request) {
  const { error, adminUser } = await requireAdminApiRole(["superuser", "admin"]);

  if (error) return error;

  const form = await request.formData();
  const email = clean(form.get("email")).toLowerCase();
  const password = clean(form.get("password"));
  const role = clean(form.get("role")) || "user";

  if (!email || !password) {
    return Response.json({ error: "Email and password are required." }, { status: 400 });
  }

  if (role === "superuser" && adminUser?.role !== "superuser") {
    return Response.json(
      { error: "Only superusers can create superusers." },
      { status: 403 }
    );
  }

  const allowedRoles =
    adminUser?.role === "superuser"
      ? ["user", "owner", "admin", "superuser"]
      : ["user", "owner", "admin"];

  if (!allowedRoles.includes(role)) {
    return Response.json({ error: "Invalid role." }, { status: 400 });
  }

  const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role,
      is_superadmin: role === "superuser",
    },
  });

  if (createError || !data.user) {
    return Response.json(
      { error: createError?.message || "Unable to create user." },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabaseAdmin.from("users").upsert(
    {
      id: data.user.id,
      email,
      role,
      is_superadmin: role === "superuser",
    },
    { onConflict: "id" }
  );

  if (profileError) {
    return Response.json({ error: profileError.message }, { status: 500 });
  }

  return Response.json({ success: true, userId: data.user.id });
}
