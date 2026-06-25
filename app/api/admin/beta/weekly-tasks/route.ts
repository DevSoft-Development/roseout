import { NextResponse } from "next/server";
import { requireBetaAdmin } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json({
    success: true,
    deprecated: true,
    tasks: [],
    message: "Legacy beta task templates are deprecated and hidden. Weekly beta sessions are managed from Giveaway → Weekly Beta.",
  });
}

export async function PATCH() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  return NextResponse.json({
    success: false,
    deprecated: true,
    error: "Legacy beta task templates can no longer be edited. Use Giveaway → Weekly Beta.",
  }, { status: 410 });
}
