import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TALENT_POOL_FIELDS = "id,application_id,candidate_name,email,tags,owner_id,notes,status,last_contacted_at,created_at,updated_at" as const;

function nullableString(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export async function GET() {
  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.careers);
    const { data, error } = await supabaseAdmin
      .from("career_talent_pool")
      .select(TALENT_POOL_FIELDS)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: "We could not load these careers records." }, { status: 500 });
    return NextResponse.json({ records: data || [] });
  } catch {
    return NextResponse.json({ error: "We could not load these careers records." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.careersEdit);
    const body = await req.json();
    const payload = {
      application_id: nullableString(body.application_id),
      candidate_name: nullableString(body.candidate_name),
      email: nullableString(body.email),
      tags: Array.isArray(body.tags) ? body.tags.filter((value: unknown) => typeof value === "string").slice(0, 50) : [],
      owner_id: nullableString(body.owner_id) || admin.user_id,
      notes: nullableString(body.notes),
      status: nullableString(body.status) || "active",
      last_contacted_at: nullableString(body.last_contacted_at),
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from("career_talent_pool")
      .insert(payload)
      .select(TALENT_POOL_FIELDS)
      .single();
    if (error) return NextResponse.json({ error: "We could not save this careers record." }, { status: 400 });
    return NextResponse.json({ record: data });
  } catch {
    return NextResponse.json({ error: "We could not save this careers record." }, { status: 500 });
  }
}
