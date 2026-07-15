import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const roles = ["superadmin", "admin", "manager"] as const;
const MAX_BYTES = 2 * 1024 * 1024;
const