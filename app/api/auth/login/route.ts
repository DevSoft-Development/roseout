import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import {
  DEFAULT_LOGIN_REDIRECT_PATH,
  resolveLoginRedirect,
} from "@/lib/login-redirect";

type CookieToSet = {
  name: string;
  value: string;
  options: Parameters<NextResponse["cookies"]["set"]>[2];
};

function jsonResponse(
  body: { redirectPath?: string; error?: string },
  cookiesToSet: CookieToSet[],
  status = 200
) {
  const response = NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });

  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options);
  });

  return response;
}

export async function POST(request: NextRequest) {
  const { email, password } = await request.json().catch(() => ({
    email: "",
    password: "",
  }));

  const cookiesToSet: CookieToSet[] = [];

  if (
    !email ||
    !password ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    return jsonResponse(
      { error: "Please enter your email and password." },
      cookiesToSet,
      400
    );
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(serverCookies) {
          cookiesToSet.push(...serverCookies);
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !data.user) {
    return jsonResponse(
      { error: error?.message || "Login failed. Please try again." },
      cookiesToSet,
      401
    );
  }

  const redirectPath = await resolveLoginRedirect(data.user);

  return jsonResponse({ redirectPath: redirectPath || DEFAULT_LOGIN_REDIRECT_PATH }, cookiesToSet);
}
