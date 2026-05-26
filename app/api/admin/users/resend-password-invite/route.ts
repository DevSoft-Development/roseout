import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: Request) {
  const { error } = await requireAdminApiRole(["superuser", "admin"]);
  if (error) return error;

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  if (!email) return Response.json({ error: "Email required." }, { status: 400 });

  await supabaseAdmin
    .from("password_setup_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("email", email)
    .is("used_at", null)
    .eq("purpose", "create_password");

  const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || ""}/auth/create-password`,
  });

  if (invited.error) return Response.json({ error: invited.error.message }, { status: 400 });
  return Response.json({ success: true });
}
