import { NextResponse } from "next/server";
import { repairBetaAccessForEmail } from "@/lib/beta/programAccess";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireBetaAdmin, safeError } from "../../../_shared";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data: tester } = await supabaseAdmin.from("beta_testers").select("*").eq("id", id).maybeSingle();
  if (!tester) return safeError("Beta tester not found.", 404);
  try {
    const repair = await repairBetaAccessForEmail({ email: tester.email, fullName: tester.name, phone: tester.phone, testerType: tester.tester_type, applicationId: tester.application_id, actor: auth.adminUser, sendInviteIfNeeded: true });
    return NextResponse.json({ success: true, repair });
  } catch (error) {
    return safeError(error instanceof Error ? error.message : "Unable to resend verify/create-password email.", 500);
  }
}
