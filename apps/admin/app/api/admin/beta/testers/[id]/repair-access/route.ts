import { NextResponse } from "next/server";
import { repairBetaAccessForEmail } from "@/lib/beta/programAccess";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { requireBetaAdmin, safeError } from "../../../_shared";

const TESTER_REPAIR_FIELDS = "email,name,phone,tester_type,application_id" as const;

function repairSummary(repair: Awaited<ReturnType<typeof repairBetaAccessForEmail>>) {
  return {
    userId: repair.userId,
    betaRecordId: repair.tester?.id || null,
    inviteSent: Boolean(repair.inviteResult?.invite_sent),
    createdUser: Boolean(repair.inviteResult?.created_user),
    assignedCount: Array.isArray(repair.assigned) ? repair.assigned.length : Number(repair.assigned || 0),
  };
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireBetaAdmin();
  if (auth.error) return auth.error;
  const { id } = await params;
  const { data: tester, error } = await supabaseAdmin.from("beta_testers").select(TESTER_REPAIR_FIELDS).eq("id", id).maybeSingle();
  if (error) return safeError();
  if (!tester) return safeError("Beta tester not found.", 404);
  try {
    const repair = await repairBetaAccessForEmail({
      email: tester.email,
      fullName: tester.name,
      phone: tester.phone,
      testerType: tester.tester_type,
      applicationId: tester.application_id,
      actor: auth.adminUser,
      sendInviteIfNeeded: false,
    });
    return NextResponse.json({ success: true, repair: repairSummary(repair) });
  } catch (error) {
    return safeError(error instanceof Error ? error.message : "Unable to repair beta access.", 500);
  }
}
