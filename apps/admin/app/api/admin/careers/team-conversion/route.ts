import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CONVERSION_FIELDS = "id,application_id,user_id,team_role,department,manager_id,start_date,permissions,assigned_market_id,assigned_locations,converted_by,converted_at,created_at,company_email,microsoft_user_id,admin_role,team_type,provisioning_status,offboarding_status,provisioned_at,offboarded_at,offboarded_by,welcome_sent_at,updated_at";
const ALLOWED_CREATE_FIELDS = new Set(["user_id","team_role","department","manager_id","start_date","permissions","assigned_market_id","assigned_locations","company_email","microsoft_user_id","admin_role","team_type"]);

export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersTeamConversion);
    const body = await req.json().catch(() => ({}));
    const applicationId = String(body.application_id || body.applicationId || "").trim();
    if (!applicationId) return NextResponse.json({ error: "Application is required." }, { status: 400 });

    const { data: existing } = await supabaseAdmin
      .from("career_team_conversions")
      .select(CONVERSION_FIELDS)
      .eq("application_id", applicationId)
      .maybeSingle();
    if (existing) return NextResponse.json({ conversion: existing, message: "Conversion record already exists." });

    const record: Record<string, unknown> = {
      application_id: applicationId,
      converted_by: admin.user_id,
      converted_at: new Date().toISOString(),
    };
    for (const [key, value] of Object.entries(body)) if (ALLOWED_CREATE_FIELDS.has(key)) record[key] = value;
    if (typeof record.company_email === "string") record.company_email = record.company_email.trim().toLowerCase().slice(0, 320);
    if (typeof record.team_role === "string") record.team_role = record.team_role.trim().slice(0, 120);
    if (typeof record.department === "string") record.department = record.department.trim().slice(0, 120);

    const { data, error } = await supabaseAdmin
      .from("career_team_conversions")
      .insert(record)
      .select(CONVERSION_FIELDS)
      .single();
    if (error) return NextResponse.json({ error: "We could not create this conversion record." }, { status: 400 });
    return NextResponse.json({ conversion: data, message: "Conversion record created and ready for employee provisioning." });
  } catch {
    return NextResponse.json({ error: "We could not create this conversion record." }, { status: 500 });
  }
}
