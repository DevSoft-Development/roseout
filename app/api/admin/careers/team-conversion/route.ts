import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersTeamConversion);
    const body = await req.json();
    const applicationId = String(body.application_id || body.applicationId || "").trim();
    if (!applicationId) return NextResponse.json({ error: "Application is required." }, { status: 400 });

    const { data: existing } = await supabaseAdmin
      .from("career_team_conversions")
      .select("*")
      .eq("application_id", applicationId)
      .maybeSingle();
    if (existing) return NextResponse.json({ conversion: existing, message: "Conversion record already exists." });

    const { data, error } = await supabaseAdmin
      .from("career_team_conversions")
      .insert({ ...body, application_id: applicationId, converted_by: admin.user_id })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "We could not create this conversion record." }, { status: 400 });
    return NextResponse.json({ conversion: data, message: "Conversion record created and ready for employee provisioning." });
  } catch {
    return NextResponse.json({ error: "We could not create this conversion record." }, { status: 500 });
  }
}
