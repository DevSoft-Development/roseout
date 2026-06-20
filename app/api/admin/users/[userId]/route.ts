import { NextResponse } from "next/server";
import { disableAdminUser, getAdminUserDetail, requireAdminOrSupport, updateAdminUserProfile, updateUserPlan, updateUserRole } from "@/lib/admin-users";

export async function GET(_: Request, { params }: { params: Promise<{ userId: string }> }) {
  try { return NextResponse.json({ success: true, user: await getAdminUserDetail((await params).userId) }); }
  catch (e: any) { return NextResponse.json({ success: false, error: e.message }, { status: 403 }); }
}
export async function PATCH(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requireAdminOrSupport();
    const userId = (await params).userId;
    const body = await req.json();
    const profile = await updateAdminUserProfile(userId, body, actor, req);
    if (typeof body.role === "string") await updateUserRole(userId, body.role, actor, req);
    if (typeof body.plan === "string") await updateUserPlan(userId, body.plan, actor, req);
    return NextResponse.json({ success: true, profile });
  } catch (e: any) { return NextResponse.json({ success: false, error: e.message }, { status: 400 }); }
}
export async function DELETE(req: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requireAdminOrSupport();
    const body = await req.json().catch(() => ({}));
    const detail = await getAdminUserDetail((await params).userId);
    const confirmation = String(body.confirmation || "").trim();
    if (confirmation !== "DELETE" && confirmation.toLowerCase() !== String(detail.profile.email || "").toLowerCase()) return NextResponse.json({ success: false, error: "Type DELETE or the user email to confirm." }, { status: 400 });
    await disableAdminUser(detail.profile.id, String(body.reason || ""), actor, req);
    return NextResponse.json({ success: true });
  } catch (e: any) { return NextResponse.json({ success: false, error: e.message }, { status: 400 }); }
}
