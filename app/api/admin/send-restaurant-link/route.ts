import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.crmEdit);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();

    if (!body.email) {
      return NextResponse.json(
        { error: "Email is required." },
        { status: 400 }
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

    const { error } = await supabaseAdmin.auth.signInWithOtp({
      email: body.email,
      options: {
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Restaurant login link sent.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Server error." },
      { status: 500 }
    );
  }
}