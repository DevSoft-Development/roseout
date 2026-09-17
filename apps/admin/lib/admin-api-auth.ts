import { NextResponse } from "next/server";

import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import type { AdminRole } from "@theouthaven/auth/admin-roles";

export async function requireAdminApiRole(allowedRoles: readonly AdminRole[]) {
  const adminUser = await getCurrentAdminOrNull();

  if (!adminUser) {
    return {
      adminUser: null,
      error: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }

  if (!allowedRoles.includes(adminUser.role)) {
    return {
      adminUser: null,
      error: NextResponse.json({ error: "forbidden" }, { status: 403 }),
    };
  }

  return { adminUser, error: null };
}
