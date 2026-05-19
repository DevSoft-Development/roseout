import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { normalizePromoCode } from "@/lib/promo-codes";

export async function GET(request: NextRequest) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]);
  if (auth.error) return auth.error;
  const search = request.nextUrl.searchParams.get("q")?.trim();
  let query = supabaseAdmin.from("promo_codes").select("*").order("created_at", { ascending: false });
  if (search) query = query.ilike("code", `%${search}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ promo_codes: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]);
  if (auth.error) return auth.error;
  const body = await request.json();
  if (!body.code) return NextResponse.json({ error: "Code is required." }, { status: 400 });
  const payload = { ...body, code: normalizePromoCode(body.code), created_by: auth.adminUser?.id ?? null };
  const { data, error } = await supabaseAdmin.from("promo_codes").insert(payload).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ promo_code: data });
}
