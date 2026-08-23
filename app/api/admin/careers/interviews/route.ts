import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { validateNewYorkHiringText } from "@/lib/careers/new-york-compliance";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { data } = await supabaseAdmin.from("career_interviews").select("*").limit(100);
    return NextResponse.json({ records: data || [] });
  } catch {
    return NextResponse.json({ error: "We could not load these careers records." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const body = await req.json();
    for (const value of [body.internal_notes, body.candidate_notes, body.outcome]) {
      const issue = validateNewYorkHiringText(value);
      if (issue) return NextResponse.json({ error: issue.message, compliance: "new_york", code: issue.key }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from("career_interviews").insert({ ...body, created_by: body.created_by || admin.user_id }).select("*").single();
    if (error) return NextResponse.json({ error: "We could not save this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not save this careers record." }, { status: 500 });
  }
}
