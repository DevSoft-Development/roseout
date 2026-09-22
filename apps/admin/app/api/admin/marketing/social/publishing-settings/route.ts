import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const keys = [
  "social_publishing_global_pause",
  "social_publishing_pause_instagram",
  "social_publishing_pause_facebook",
  "social_publishing_pause_tiktok",
  "social_publishing_pause_youtube",
] as const;

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketing);
  if (auth.error) return auth.error;
  const { data, error } = await supabaseAdmin.from("marketing_settings").select("key,value").in("key", [...keys]);
  if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, settings: Object.fromEntries((data || []).map((row) => [row.key, row.value])) });
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.marketingSocialAccounts);
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const rows = keys
      .filter((key) => key in body)
      .map((key) => ({ key, value: Boolean(body[key]), updated_at: new Date().toISOString() }));
    if (!rows.length) return NextResponse.json({ success: false, error: "No publishing settings supplied." }, { status: 400 });
    const { error } = await supabaseAdmin.from("marketing_settings").upsert(rows, { onConflict: "key" });
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not update publishing controls." }, { status: 500 });
  }
}
