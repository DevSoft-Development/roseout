import { NextResponse } from "next/server";
import { requireBetaAdmin } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json({
    success: true,
    deprecated: true,
    createdCount: 0,
    tasks: [],
    message: "Legacy starter task templates are no longer used. Weekly beta sessions are managed from Giveaway → Weekly Beta.",
  });
}
