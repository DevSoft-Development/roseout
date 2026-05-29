import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { resolveLoginDestination } from "@/lib/auth/login-destination";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user?.id) {
    return NextResponse.json(
      {
        ok: false,
        redirectTo: "/signup",
        reason: error?.message || "no_authenticated_user",
      },
      { status: 401 },
    );
  }

  const requestUrl = new URL(request.url);
  const intendedPath = sanitizeIntendedPath(requestUrl.searchParams.get("next"));

  const destination = await resolveLoginDestination({
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    intendedPath,
  });

  return NextResponse.json({
    ok: true,
    userId: user.id,
    email: user.email ?? null,
    ...destination,
  });
}
