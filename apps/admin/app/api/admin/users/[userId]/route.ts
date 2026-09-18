import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  disableAdminUser,
  getAdminUserDetail,
  updateAdminUserProfile,
  updateUserPlan,
  updateUserRole,
} from "@/lib/admin/admin-user-detail";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAdminApiRole(["superadmin"]);
    if (auth.error) return auth.error;
    return NextResponse.json({ success: true, user: await getAdminUserDetail((await params).userId) });
  } catch {
    return NextResponse.json({ success: false, action: "admin_user_detail", error: "User could not be loaded." }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAdminApiRole(["superadmin"]);
    if (auth.error || !auth.adminUser) return auth.error;
    const userId = (await params).userId;
    const body = await req.json();
    const profile = await updateAdminUserProfile(userId, body, auth.adminUser, req);
    if (typeof body.role === "string") await updateUserRole(userId, body.role, auth.adminUser, req);
    if (typeof body.plan === "string") await updateUserPlan(userId, body.plan, auth.adminUser, req);
    return NextResponse.json({ success: true, profile });
  } catch {
    return NextResponse.json({ success: false, action: "admin_user_update", error: "User could not be updated." }, { status: 400 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const auth = await requireAdminApiRole(["superadmin"]);
    if (auth.error || !auth.adminUser) return auth.error;
    const userId = (await params).userId;
    const body = await req.json().catch(() => ({}));
    const detail = await getAdminUserDetail(userId);
    const confirmation = String(body.confirmation || "").trim();
    if (confirmation !== "DELETE" && confirmation.toLowerCase() !== String(detail.profile.email || "").toLowerCase()) {
      return NextResponse.json({ success: false, error: "Type DELETE or the user email to confirm." }, { status: 400 });
    }
    await disableAdminUser(detail.profile.id, String(body.reason || ""), auth.adminUser, req);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, action: "admin_user_update", error: "User could not be updated." }, { status: 400 });
  }
}
