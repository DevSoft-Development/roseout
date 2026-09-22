import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const CAREER_APPLICATION_FIELDS = "id,job_id,user_id,first_name,last_name,email,phone,city,state,linkedin_url,portfolio_url,website_url,social_handle,resume_url,cover_letter,status,stage,score,source,assigned_to,last_contacted_at,submitted_at,created_at,updated_at" as const;

function nullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function GET() {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { data, error } = await supabaseAdmin
      .from("career_applications")
      .select(CAREER_APPLICATION_FIELDS)
      .order("submitted_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: "We could not load these careers records." }, { status: 500 });
    return NextResponse.json({ records: data || [] });
  } catch {
    return NextResponse.json({ error: "We could not load these careers records." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const body = await req.json();
    const payload = {
      job_id: nullableString(body.job_id),
      user_id: nullableString(body.user_id),
      first_name: nullableString(body.first_name),
      last_name: nullableString(body.last_name),
      email: nullableString(body.email),
      phone: nullableString(body.phone),
      city: nullableString(body.city),
      state: nullableString(body.state),
      linkedin_url: nullableString(body.linkedin_url),
      portfolio_url: nullableString(body.portfolio_url),
      website_url: nullableString(body.website_url),
      social_handle: nullableString(body.social_handle),
      resume_url: nullableString(body.resume_url),
      cover_letter: nullableString(body.cover_letter),
      status: nullableString(body.status) || "new",
      stage: nullableString(body.stage) || "applied",
      score: body.score == null || body.score === "" ? null : Number(body.score),
      source: nullableString(body.source),
      assigned_to: nullableString(body.assigned_to),
      last_contacted_at: nullableString(body.last_contacted_at),
      submitted_at: nullableString(body.submitted_at) || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from("career_applications")
      .insert(payload)
      .select(CAREER_APPLICATION_FIELDS)
      .single();
    if (error) return NextResponse.json({ error: "We could not save this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not save this careers record." }, { status: 500 });
  }
}
