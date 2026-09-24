import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

function normalizeEmail(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (!email || !validEmail(email)) {
    return NextResponse.json({ success: false, error: "Enter a valid email address." }, { status: 400 });
  }

  try {
    let page = 1;
    let existing: any = null;
    while (page <= 10 && !existing) {
      const listed = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
      if (listed.error) throw listed.error;
      existing = listed.data.users?.find((user) => user.email?.toLowerCase() === email) || null;
      if (!listed.data.users || listed.data.users.length < 1000) break;
      page += 1;
    }

    return NextResponse.json({
      success: true,
      accountExists: Boolean(existing),
      emailConfirmed: Boolean(existing?.email_confirmed_at),
      email,
    });
  } catch (error) {
    console.error("ACCOUNT_EXISTS_LOOKUP_ERROR", error);
    return NextResponse.json(
      { success: false, error: "We could not check this email right now." },
      { status: 500 },
    );
  }
}
