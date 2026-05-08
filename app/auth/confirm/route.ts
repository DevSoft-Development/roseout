import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient, type EmailOtpType } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: NextRequest) {
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.vercel.app";

  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = (url.searchParams.get("type") || "magiclink") as EmailOtpType;

  const response = NextResponse.redirect(`${siteUrl}/restaurants/dashboard`);

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

  if (!tokenHash) {
    response.headers.set("Location", `${siteUrl}/restaurants/apply`);
    return response;
  }

  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error || !data.user) {
    response.headers.set("Location", `${siteUrl}/restaurants/apply`);
    return response;
  }

  const user = data.user;

  if (user.user_metadata?.role === "superuser") {
    response.headers.set("Location", `${siteUrl}/admin`);
    return response;
  }

  const email = user.email?.toLowerCase();

  if (!email) {
    response.headers.set("Location", `${siteUrl}/restaurants/apply`);
    return response;
  }

  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .ilike("email", email)
    .maybeSingle();

  if (!restaurant) {
    response.headers.set("Location", `${siteUrl}/restaurants/apply`);
    return response;
  }

  
await supabaseAdmin.from("restaurant_events").insert({
  restaurant_id: restaurant.id,
  email,
  event_type: "login_link_clicked",
  metadata: {
    source: "magic_link",
  },
});

  await supabaseAdmin.from("restaurant_events").insert({
  restaurant_id: restaurant.id,
  email,
  event_type: "login_link_clicked",
  metadata: {
    source: "magic_link",
  },
});

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

  response.headers.set("Location", `${siteUrl}/restaurants/dashboard`);
  return response;
}