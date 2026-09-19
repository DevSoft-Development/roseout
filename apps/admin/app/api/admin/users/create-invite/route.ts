import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { createUserPasswordInvite } from "@/lib/admin/createUserPasswordInvite";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { isUserRole, normalizeRole } from "@/lib/users/roles";

export async function POST(request: Request) {
  const { error, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.adminUsers);
  if (error) return error;

  const body = await request.json();
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const role = normalizeRole(String(body.role || "user"));

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return Response.json({ error: "Valid email is required." }, { status: 400 });
  if (!isUserRole(role)) return Response.json({ error: "Unsupported role." }, { status: 400 });

  try {
    const invite = await createUserPasswordInvite({
      email,
      firstName,
      lastName,
      role,
      phone: body.phone ? String(body.phone).trim() : null,
      source: "admin_create_invite",
      createdBy: adminUser?.user_id || null,
      sendInvite: Boolean(body.send_invite ?? true),
      assignedLocationId: body.assigned_location_id || null,
    });

    return Response.json({
      success: true,
      invite_sent: invite.invite_sent,
      reused_user: invite.reused_user,
      message: invite.invite_sent ? "User invitation ready and password setup email sent." : "User invitation ready.",
      user: { id: invite.user_id, email },
      invite_error: invite.invite_error,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to create invite." }, { status: 500 });
  }
}
