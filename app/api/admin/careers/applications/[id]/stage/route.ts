import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersApplicationsManage);
    const { id } = await params;
    const { stage, reason } = await req.json();
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
