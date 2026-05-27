import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET() {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]);
  if (auth.error) return auth.error;
  const [loc, users, reviews, claims] = await Promise.all([
    supabaseAdmin.from("locations").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("users").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("location_reviews").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("location_claim_requests").select("id", { count: "exact", head: true }),
  ]);
  return NextResponse.json({ totalLocations: loc.count || 0, totalUsers: users.count || 0, totalReviews: reviews.count || 0, totalClaims: claims.count || 0 });
}
