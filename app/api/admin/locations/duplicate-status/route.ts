import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Body = {
  locationId?: string;
  action?: "check" | "clear_stale";
};

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Body;
    const locationId = String(body.locationId