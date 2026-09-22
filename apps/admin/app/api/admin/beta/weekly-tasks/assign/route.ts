import { NextResponse } from "next/server";
import { getOrCreateWeeklyBetaSessionsForActiveTesters } from "@/lib/giveaway/betaProgram";
import { requireBetaAdmin, safeError } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const result = await getOrCreateWeeklyBetaSessionsForActiveTesters();
    return NextResponse.json({ success: true, ...result, message: `Created ${result.created}; already existed ${result.alreadyExisted}; skipped ${result.skipped}.` });
  } catch (error: any) {
    return safeError(error.message || "Unable to create weekly beta sessions.", 500);
  }
}
