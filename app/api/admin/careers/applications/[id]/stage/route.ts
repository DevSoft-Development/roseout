import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CONTROLLED_STAGES = new Set([
  "shortlisted",
  "interview_requested",
  "interview_scheduled",
  "interview_completed",
  "content_test",
  "offer_pending",
  "offer_sent",
  "hired",
  "not_selected",
  "talent_pool",
]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const { stage, reason } = await req.json();

    if (CONTROLLED_STAGES.has(stage)) {
      return NextResponse.json({ error: "Use the guided Hiring Workflow for this stage so New York selection safeguards and the audit trail are enforced." }, { status: 400 });
    }

    const issue = validateNewYorkHiringText(reason);
    if (issue) return NextResponse.json({ error: issue.message, compliance: "new_york", code: issue.key }, { status: 400 });

    const { error } = await supabaseAdmin.rpc("career_set_application_stage", {
      p_application_id: id,
      p_stage: stage,
      p_changed_by: admin.user_id,
      p_reason: reason || "Admin stage update",
    });
    if (error) return NextResponse.json({ error: "We could not move this applicant." }, { status: 400 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "We could not move this applicant." }, { status: 500 });
  }
}
