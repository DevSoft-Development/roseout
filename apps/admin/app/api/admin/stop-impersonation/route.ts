import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

export async function POST() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.impersonation);
  if (auth.error) return auth.error;

  const cookieStore = await cookies();

  cookieStore.delete("theouthaven_impersonate_user_id");
  cookieStore.delete("theouthaven_impersonate_location_id");
  cookieStore.delete("theouthaven_impersonate_location_type");
  cookieStore.delete("theouthaven_impersonate_target_type");

  return NextResponse.json({ success: true });
}