import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { syncClaimFieldsToLocations } from "@/lib/claimQr";

async function isAllowed(req: Request) {
  const secret = req.headers.get("x-internal-import-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  if (secret && (secret === process.env.IMPORT_SECRET || secret === process.env.CRON_SECRET)) return true;
  try { await requireAdminRole(["superadmin", "admin"]); return true; } catch { return false; }
}

async function run(req: Request) {
  if (!(await isAllowed(req))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const result = await syncClaimFieldsToLocations();
  return NextResponse.json({ ok: true, message: "Claim QR fields backfilled for restaurants, activities, and locations.", result });
}

export async function GET(req: Request) { return run(req); }
export async function POST(req: Request) { return run(req); }
