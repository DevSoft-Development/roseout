import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { generateMissingLocationQrs } from "@/lib/qr/locationQr";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;
async function authorize() { if (process.env.NODE_ENV === "development") return null; const { error } = await requireAdminApiRole(["admin", "superadmin"]); return error; }
export async function POST(request: NextRequest) { const auth = await authorize(); if (auth) return auth; const body = await request.json().catch(() => ({})); const batchId = String(body.batchId || "").trim(); if (!batchId) return NextResponse.json({ success: false, error: "batchId is required." }, { status: 400 }); const limit = Math.min(Math.max(Number(body.limit) || 250, 1), 500); const { data, error } = await supabaseAdmin.rpc("oh_publish_import_batch", { p_batch_id: batchId, p_limit: limit }); if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 }); const qr = await generateMissingLocationQrs(limit); return NextResponse.json({ success: true, ...(data || {}), qr }); }
