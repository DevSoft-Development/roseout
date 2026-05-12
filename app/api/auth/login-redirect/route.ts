import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { resolveAdminUser } from "@/lib/admin-user";

export const dynamic = "force-dynamic";

const roleRedirects: Record<string, string> = {
  superuser: "/admin/dashboard",
  admin: "/admin/dashboard",
  editor: "/admin/restaurants",
  reviewer: "/admin/claims",
  viewer: "/admin/import-history",
};

async function getAuthenticatedUser(accessToken?: string): Promise<User | null> {
  if (accessToken) {
    const {
      data: { user },
      error,
    } = await supabaseAdmin.auth.getUser(accessToken);

    if (!error && user) {
      return user;
    }
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user || null;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const accessToken =
    typeof body.accessToken === "string" ? body.accessToken : undefined;

  const user = await getAuthenticatedUser(accessToken);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminUser = await resolveAdminUser(user);

  const redirectPath = adminUser
    ? roleRedirects[adminUser.role] || "/admin/dashboard"
    : "/create";

  return Response.json({ redirectPath });
}
