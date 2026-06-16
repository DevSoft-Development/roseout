import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getSupabaseAdminClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

// This endpoint is only for superadmin-controlled admin session tooling.
// It must never be used as general authentication or trust a browser-supplied userId without superadmin verification.
export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin"]);
  if (auth.error) return auth.error;

  const { userId } = await req.json().catch(() => ({}));
  if (!userId || typeof userId !== "string") {
    return NextResponse.json({ error: "Missing or invalid userId" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdminClient();
  const { data: targetUser, error: targetError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (targetError || !targetUser?.user) {
    return NextResponse.json({ error: "Target user not found" }, { status: 404 });
  }

  const { data: adminUser } = await supabaseAdmin
    .from("admin_users")
    .select("user_id, role, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (!adminUser || !["superadmin", "admin"].includes(String(adminUser.role)) || String(adminUser.status ?? "active") !== "active") {
    return NextResponse.json({ error: "Target user is not eligible for admin session tooling" }, { status: 403 });
  }

  const cookieStore = await cookies();
  cookieStore.set("theouthaven_admin_user_id", userId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });

  return NextResponse.json({ success: true });
}
