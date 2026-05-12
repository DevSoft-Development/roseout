import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const roleRedirects: Record<string, string> = {
  superuser: "/admin/dashboard",
  admin: "/admin/dashboard",
  editor: "/admin/restaurants",
  reviewer: "/admin/claims",
  viewer: "/admin/import-history",
};

async function getAuthenticatedEmail(accessToken?: string) {
  if (accessToken) {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (!error && user?.email) {
      return user.email.toLowerCase();
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user?.email?.toLowerCase() || null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const accessToken =
    typeof body.accessToken === "string" ? body.accessToken : undefined;

  const email = await getAuthenticatedEmail(accessToken);

  if (!email) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: adminUser, error } = await supabaseAdmin
    .from("admin_users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const redirectPath = adminUser
    ? roleRedirects[adminUser.role] || "/admin/dashboard"
    : "/create";

  return Response.json({ redirectPath });
}
