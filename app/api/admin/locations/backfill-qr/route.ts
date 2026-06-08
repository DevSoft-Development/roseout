import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { syncClaimFieldsToLocations } from "@/lib/claimQrServer";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

async function isAllowed(req: Request) {
  const secret =
    req.headers.get("x-internal-import-secret") ||
    req.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && (secret === process.env.IMPORT_SECRET || secret === process.env.CRON_SECRET)) {
    return true;
  }

  try {
    await requireAdminRole(ADMIN_PAGE_ACCESS.import);
    return true;
  } catch {
    return false;
  }
}

async function run(req: Request) {
  if (!(await isAllowed(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const forceCanonicalUrl =
    url.searchParams.get("force") === "1" ||
    url.searchParams.get("repairLegacy") === "1";

  const regenerateQr =
    url.searchParams.get("regenerateQr") === "1" ||
    forceCanonicalUrl;

  const result = await syncClaimFieldsToLocations({
    forceCanonicalUrl,
    regenerateQr,
  });

  return NextResponse.json({
    ok: true,
    message: forceCanonicalUrl
      ? "Claim QR fields repaired and legacy roseout URLs regenerated for TheOutHaven."
      : "Claim QR fields backfilled for restaurants, activities, and locations.",
    result,
  });
}

export async function GET(req: Request) {
  return run(req);
}

export async function POST(req: Request) {
  return run(req);
}
