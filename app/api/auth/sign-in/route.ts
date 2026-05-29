import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { resolveLoginDestination } from "@/lib/auth/login-destination";
import { sanitizeIntendedPath } from "@/lib/auth-redirect";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const intendedPath = sanitizeIntendedPath(
    typeof body?.next === "string" ? body.next : null,
  );

  if (!email || !password) {
    return NextResponse.json(
      {
        ok: false,
        message: "Please enter your email and password.",
      },
      { status: 400 },
    );
  }

  const cookieResponse = NextResponse.json({
    ok: false,
    message: "Unable to sign in.",
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieResponse.cookies.set(name, value, {
              ...options,
              path: "/",
            });
          });
        },
      },
    },
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    return NextResponse.json(
      {
        ok: false,
        message: error?.message || "Invalid email or password.",
      },
      { status: 401 },
    );
  }

  const destination = await resolveLoginDestination({
    user: {
      id: data.user.id,
      email: data.user.email ?? email,
    },
    intendedPath,
  });

  const finalResponse = NextResponse.json({
    ok: true,
    redirectTo: destination.redirectTo,
    adminRole: destination.adminRole,
    profileRole: destination.profileRole,
    profileAccountType: destination.profileAccountType,
    isLocationOwner: destination.isLocationOwner,
    debug: destination.debug,
  });

  /*
    Important:
    The first response object received cookies during signInWithPassword.
    Copy those cookies to the final response so the browser receives the auth session.
  */
  cookieResponse.cookies.getAll().forEach((cookie) => {
    finalResponse.cookies.set(cookie);
  });

  return finalResponse;
}
