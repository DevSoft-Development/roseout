import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStrongPasswordErrors, strongPasswordMessage } from "@/lib/password-policy";

const VALID_ROLES = [
  "user",
  "owner",
  "viewer",
  "editor",
  "reviewer",
  "admin",
  "superuser",
  "disabled",
];

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);

  if (error) return error;

  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "user");

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (!VALID_ROLES.includes(role)) {
    return NextResponse.json({ error: "Invalid role." }, { status: 400 });
  }

  const passwordErrors = getStrongPasswordErrors(password);

  if (passwordErrors.length) {
    return NextResponse.json(
      { error: `Password must include: ${strongPasswordMessage()}.` },
      { status: 400 }
    );
  }

  const { data: authUser, error: createError } =
    await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
      },
    });

  if (createError || !authUser.user) {
    return NextResponse.json(
      { error: createError?.message || "Unable to create user." },
      { status: 500 }
    );
  }

  const { error: profileError } = await supabaseAdmin.from("users").upsert({
    id: authUser.user.id,
    email,
    role,
    is_superadmin: role === "superuser",
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, userId: authUser.user.id });
}
