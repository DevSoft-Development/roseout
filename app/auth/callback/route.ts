import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${siteUrl}/restaurants/apply`);
  }

  let response = NextResponse.redirect(`${siteUrl}/restaurants/dashboard`);

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
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${siteUrl}/restaurants/apply`);
  }

  const user = data.user;

  if (user.user_metadata?.role === "superuser") {
    response = NextResponse.redirect(`${siteUrl}/admin/dashboard`);
  }

  const email = user.email?.toLowerCase();

  if (!email) {
    return NextResponse.redirect(`${siteUrl}/restaurants/apply`);
  }

  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!restaurant && user.user_metadata?.role !== "superuser") {
    return NextResponse.redirect(`${siteUrl}/restaurants/apply`);
  }

  if (restaurant) {
    await supabaseAdmin
      .from("restaurants")
      .update({
        owner_user_id: user.id,
        owner_email: email,
      })
      .eq("id", restaurant.id);

    await supabaseAdmin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        role: "restaurants",
      },
    });

    response = NextResponse.redirect(`${siteUrl}/restaurants/dashboard`);
  }

  return response;
}