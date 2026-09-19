import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

const ADMIN_CONTEXT_COOKIES = [
  "theouthaven_impersonate_location_id",
  "theouthaven_impersonate_user_id",
  "theouthaven_admin_user_id",
  "theouthaven_impersonate_target_type",
] as const;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const destination = new URL(user ? "/locations/dashboard" : "/login?next=/locations/dashboard", request.url);
  const response = NextResponse.redirect(destination);
  for (const name of ADMIN_CONTEXT_COOKIES) response.cookies.delete(name);
  return response;
}
