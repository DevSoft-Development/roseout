import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { getWeeklyBetaEnabled } from "@/lib/beta/weeklyTasks";
import { getWeeklyBetaCardForUser } from "@/lib/giveaway/betaProgram";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) return NextResponse.json({ success: false, error: "Login required." }, { status: 401 });
  const url = new URL(request.url);
  const testMode = url.searchParams.get("test") === "1" || url.searchParams.get("test_mode") === "true";
  if (!testMode && !(await getWeeklyBetaEnabled())) {
    return NextResponse.json({ success: true, tasks: [], assignments: [], message: "Weekly beta task is not open yet." });
  }
  const card = await getWeeklyBetaCardForUser(user.id, testMode);
  return NextResponse.json({ success: true, tasks: [card.assignment], assignments: [card.assignment], session: card.session });
}
