import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { checkEventbriteConnectivity } from "@/lib/events/providers/eventbriteClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  if (error) return error;

  try {
    const result = await checkEventbriteConnectivity();
    if (!result.configured) {
      return NextResponse.json({
        success: false,
        provider: "eventbrite",
        configured: false,
        authenticated: false,
        error: "EVENTBRITE_PRIVATE_TOKEN is not configured in this deployment.",
      }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      provider: "eventbrite",
      ...result,
      writesPerformed: false,
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      provider: "eventbrite",
      configured: Boolean(process.env.EVENTBRITE_PRIVATE_TOKEN?.trim()),
      authenticated: false,
      error: error instanceof Error ? error.message : "Eventbrite connectivity check failed.",
      writesPerformed: false,
    }, { status: 502 });
  }
}
