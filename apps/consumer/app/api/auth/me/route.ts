import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { isAdminRole, normalizeRole } from "@/lib/users/roles";

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id) {
    return NextResponse.json({ user: null, isAdmin: false });
  }

  const { data: profile } = await supabaseAdmin
    .from("user_profiles")
    .select("full_name, preferred_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  const role =
    typeof adminUser?.role === "string" ? normalizeRole(adminUser.role) : null;
  const name =
    (typeof profile?.preferred_name === "string" &&
      profile.preferred_name.trim()) ||
    (typeof profile?.full_name === "string" && profile.full_name.trim()) ||
    metadataString(user.user_metadata, "full_name") ||
    metadataString(user.user_metadata, "name") ||
    null;

  return NextResponse.json({
    user: { email: user.email ?? null, name },
    isAdmin: role ? isAdminRole(role) : false,
  });
}
