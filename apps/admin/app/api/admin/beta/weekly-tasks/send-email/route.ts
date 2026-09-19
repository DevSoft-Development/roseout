import { NextResponse } from "next/server";
import { sendWeeklyBetaEmail } from "@/lib/giveaway/betaProgram";
import { requireBetaAdmin, safeError } from "../../_shared";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  try {
    const results = await sendWeeklyBetaEmail();
    const sent = results.filter((result: any) => result.status === "sent").length;
    return NextResponse.json({ success: true, sent, total: results.length, message: `Weekly beta email sent to ${sent} active beta testers.` });
  } catch (error: any) {
    return safeError(error.message || "Unable to send weekly beta email.", 500);
  }
}
