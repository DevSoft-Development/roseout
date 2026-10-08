import { NextResponse } from "next/server";

import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { assignMicrosoftUserToDeviceGroup } from "@/lib/microsoft-365/intune";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

const ALLOWED_ROLES = new Set([
  "user",
  "owner",
  "viewer",
  "editor",
  "reviewer",
  "admin",
  "manager",
  "superadmin",
  "ambassador",
  "experience",
  "partner_ambassador",
  "experience_team",
]);

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin"]);
  if (auth.error || !auth.adminUser) return auth.error;

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.first_name || "").trim();
  const lastName = String(body.last_name || "").trim();
  const fullName = `${firstName} ${lastName}`.trim();
  const phone = String(body.phone || "").trim() || null;
  const role = String(body.role || "user").trim().toLowerCase();
  const deviceGroup = String(body.device_group || "standard").trim().toLowerCase();
  const sendInvite = Boolean(body.send_invite ?? true);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email is required." }, { status: 400 });
  }
  if (!ALLOWED_ROLES.has(role)) {
    return NextResponse.json({ error: "Unsupported role." }, { status: 400 });
  }
  if (!["standard", "executive"].includes(deviceGroup)) {
    return NextResponse.json({ error: "Unsupported Device Group." }, { status: 400 });
  }

  try {
    const db = getAdminDatabaseClient();
    const listed = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listed.error) throw listed.error;

    let authUser = listed.data.users.find(
      (user) => String(user.email || "").toLowerCase() === email,
    ) || null;
    let inviteSent = false;
    let reusedUser = Boolean(authUser);

    if (!authUser) {
      if (sendInvite) {
        const invited = await db.auth.admin.inviteUserByEmail(email, {
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            source: "admin_create_user",
          },
        });
        if (invited.error || !invited.data.user) {
          throw invited.error || new Error("Failed to create user invitation.");
        }
        authUser = invited.data.user;
        inviteSent = true;
      } else {
        const created = await db.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: {
            first_name: firstName,
            last_name: lastName,
            full_name: fullName,
            source: "admin_create_user",
          },
        });
        if (created.error || !created.data.user) {
          throw created.error || new Error("Failed to create user.");
        }
        authUser = created.data.user;
      }
      reusedUser = false;
    }

    const { error: profileError } = await db.from("users").upsert(
      {
        id: authUser.id,
        email,
        full_name: fullName || null,
        phone,
        role,
        status: "invited",
      },
      { onConflict: "id" },
    );
    if (profileError) throw profileError;

    if (["admin", "manager", "superadmin", "editor", "reviewer", "viewer"].includes(role)) {
      const { error: adminError } = await db.from("admin_users").upsert(
        { user_id: authUser.id, role },
        { onConflict: "user_id" },
      );
      if (adminError) throw adminError;
    }

    let deviceGroupAssigned = false;
    let deviceGroupError: string | null = null;
    try {
      await assignMicrosoftUserToDeviceGroup(
        auth.adminUser.user_id,
        email,
        deviceGroup as "standard" | "executive",
      );
      deviceGroupAssigned = true;
    } catch (error) {
      deviceGroupError = error instanceof Error ? error.message : "Device Group assignment failed.";
    }

    return NextResponse.json({
      success: true,
      user: { id: authUser.id, email },
      reused_user: reusedUser,
      invite_sent: inviteSent,
      device_group: deviceGroup,
      device_group_assigned: deviceGroupAssigned,
      device_group_error: deviceGroupError,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create user." },
      { status: 500 },
    );
  }
}
