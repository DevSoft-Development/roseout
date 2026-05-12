import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const ADMIN_DASHBOARD_PATH = "/admin/dashboard";

const roleRedirects: Record<string, string> = {
  superuser: ADMIN_DASHBOARD_PATH,
  admin: ADMIN_DASHBOARD_PATH,
  editor: "/admin/restaurants",
  reviewer: "/admin/claims",
  viewer: "/admin/import-history",
};

function createAdminClient() {
  return createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return NextResponse.json({ redirectPath: "/create" });
  }

  const email = user.email.toLowerCase();
  const metadataRole = String(user.user_metadata?.role || "").toLowerCase();

  if (roleRedirects[metadataRole]) {
    return NextResponse.json({ redirectPath: roleRedirects[metadataRole] });
  }

  const adminSupabase = createAdminClient();
  const { data: adminUser, error } = await adminSupabase
    .from("admin_users")
    .select("role")
    .eq("email", email)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message, redirectPath: "/create" },
      { status: 500 }
    );
  }

  const adminRole = String(adminUser?.role || "").toLowerCase();

  return NextResponse.json({
    redirectPath: roleRedirects[adminRole] || "/create",
  });
}
