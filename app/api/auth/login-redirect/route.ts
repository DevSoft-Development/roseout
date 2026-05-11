import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_LOGIN_REDIRECT_PATH,
  resolveLoginRedirect,
} from "@/lib/login-redirect";

function adminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  );
}

export async function POST(request: NextRequest) {
  const { accessToken } = await request.json().catch(() => ({ accessToken: "" }));

  if (!accessToken || typeof accessToken !== "string") {
    return NextResponse.json(
      { redirectPath: DEFAULT_LOGIN_REDIRECT_PATH },
      { status: 401 }
    );
  }

  const {
    data: { user },
  } = await adminSupabase().auth.getUser(accessToken);

  if (!user) {
    return NextResponse.json(
      { redirectPath: DEFAULT_LOGIN_REDIRECT_PATH },
      { status: 401 }
    );
  }

  const redirectPath = await resolveLoginRedirect(user);

  return NextResponse.json(
    { redirectPath },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
