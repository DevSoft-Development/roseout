import { NextResponse } from "next/server";
import { disableAdminUser, getAdminUserDetail, updateAdminUserProfile, updateUserPlan, updateUserRole } from "@/lib/admin-users";
import { requireSuperAdmin } from "@/lib/admin-api-auth";

export async function GET(_: Request, { params }: { params: Promise<{ userId: string }> }) {
  try { const { error: authError } = await requireSuperAdmin(); if (authError) return authError; return NextResponse.json({ success: true, user: await getAdminUserDetail((await params).userId) }); }
  catch { return NextResponse.json({ success: false, action: "admin_user_detail", error: "User could not be loaded." }, { status: 500 }); }
}
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const actor = auth.adminUser;
    const userId = (await params).userId;
    const body = await req.json();
    const profile = await updateAdminUserProfile(userId, body, actor, req);
    if (typeof body.role === "string") await updateUserRole(userId, body.role, actor, req);
    if (typeof body.plan === "string") await updateUserPlan(userId, body.plan, actor, req);
    return NextResponse.json({ success: true, profile });
  } catch { return NextResponse.json({ success: false, action: "admin_user_update", error: "User could not be updated." }, { status: 400 }); }
}
export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireSuperAdmin();
    if (auth.error) return auth.error;
    const actor = auth.adminUser;
    const body = await req.json().catch(() => ({}));
    const detail = await getAdminUserDetail((await params).userId);
    const confirmation = String(body.confirmation || "").trim();
    if (confirmation !== "DELETE" && confirmation.toLowerCase() !== String(detail.profile.email || "").toLowerCase()) return NextResponse.json({ success: false, error: "Type DELETE or the user email to confirm." }, { status: 400 });
    await disableAdminUser(detail.profile.id, String(body.reason || ""), actor, req);
    return NextResponse.json({ success: true });
  } catch { return NextResponse.json({ success: false, action: "admin_user_update", error: "User could not be updated." }, { status: 400 }); }
}
