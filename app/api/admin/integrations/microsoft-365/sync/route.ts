import { NextRequest, NextResponse } from "next/server";

import { getCurrentAdmin } from "@/lib/admin-auth";
import { syncMicrosoft365ForUser } from "@/lib/microsoft-365/sync";

export async function POST(request: NextRequest) {
  const admin = await getCurrentAdmin();
  try {
    await syncMicrosoft365ForUser(admin.user_id);
    return NextResponse.redirect(new URL("/admin/dashboard/settings/microsoft-365?synced=1", request.url), 303);
  } catch (error) {
    const url = new URL("/admin/dashboard/settings/microsoft-365", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message.slice(0, 240) : "Microsoft sync failed");
    return NextResponse.redirect(url, 303);
  }
}
