import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { importOsmActivities } from "@/lib/location-growth/osmActivities";
export const runtime = "nodejs"; export const dynamic = "force-dynamic"; export const maxDuration = 300;
async function authorize(request: NextRequest) { if (process.env.NODE_ENV === "development") return null; if (process.env.IMPORT_SECRET && request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET) return null; const { error } = await requireAdminApiRole(["admin", "superadmin"]); return error; }
export async function POST(request: NextRequest) { const auth = await authorize(request); if (auth) return auth; const body = await request.json().catch(() => ({})); const result = await importOsmActivities({ limit: body.limit || 1000 }); return NextResponse.json({ success: true, ...result }); }
