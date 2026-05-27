import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

const VALID_ROLES = [
  "user",
  "owner",
  "viewer",
  "editor",
  "reviewer",
  "admin",
  "superuser",
];

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);

  if (error) return error;

  try {
    const formData = await request.formData();
    const email = cleanString(formData.get("email")).toLowerCase();
    const password = cleanString(formData.get("password"));
    const role = cleanString(formData.get("role")) || "user";

    if (!email || !password) {
      return Response.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    if (!VALID_ROLES.includes(role)) {
      return Response.json({ error: "Invalid role." }, { status: 400 });
    }

    const { data, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
      },
    });

    if (createError || !data.user) {
      return Response.json(
        { error: createError?.message || "Could not create user." },
        { status: 400 }
      );
    }

    await supabaseAdmin.from("users").upsert(
      {
        id: data.user.id,
        email,
        role,
      },
      { onConflict: "id" }
    );

    if (["superuser", "admin", "editor", "reviewer", "viewer"].includes(role)) {
      await supabaseAdmin.from("admin_users").upsert(
        {
          email,
          role,
        },
        { onConflict: "email" }
      );
    }

    return Response.json({ success: true, user: data.user });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 }
    );
  }
}
