import { NextResponse } from "next/server";
import { getCurrentAdminOrNull } from "@theouthaven/auth/admin-session";
import { requestRunCancellation } from "@/lib/search/profile/profileRunRepository";

async function requireRunOperator() {
  const admin = await getCurrentAdminOrNull();
  if (!admin) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!["superadmin", "admin"].includes(admin.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  const authError = await requireRunOperator();
  if (authError) return authError;

  try {
    return NextResponse.json({ run: await requestRunCancellation((await params).runId) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Cancellation failed" },
      { status: 500 },
    );
  }
}
