import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runOutingSearch } from "@/lib/search/runSearch";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
