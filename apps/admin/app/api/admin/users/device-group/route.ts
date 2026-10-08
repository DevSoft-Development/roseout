import { NextResponse } from "next/server";

import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { assignMicrosoftUserToDeviceGroup } from "@/lib/microsoft-365/intune";

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin"]);
  if (auth.error || !auth.adminUser) return auth.error;

  const body = await request.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const deviceGroup = String(body.device_group || "").trim().toLowerCase();

  if (!email || !["standard", "executive"].includes(deviceGroup)) {
    return NextResponse.json(
      { error: "Email and a valid Device Group are required." },
      { status: 400 },
    );
  }

  try {
    const group = await assignMicrosoftUserToDeviceGroup(
      auth.adminUser.user_id,
      email,
      deviceGroup as "standard" | "executive",
    );

    return NextResponse.json({
      success: true,
      device_group: deviceGroup,
      group_id: group.id,
      group_name: group.displayName,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not update Device Group.",
      },
      { status: 400 },
    );
  }
}
