import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import {
  type ClaimSourceTable,
  syncClaimFieldsToLocations,
  syncClaimFieldsToLocationsBatch,
} from "@/lib/claimQrServer";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const VALID_TABLES: ClaimSourceTable[] = ["restaurants", "activities", "locations"];

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

async function readBody(req: Request) {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function run(req: Request) {
  if (!(await isAllowed(req))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const body = req.method === "POST" ? await readBody(req) : {};

  const mode = String(body.mode || url.searchParams.get("mode") || "").trim();

  const forceCanonicalUrl =
    body.forceCanonicalUrl === true ||
    body.force === true ||
    url.searchParams.get("force") === "1" ||
    url.searchParams.get("repairLegacy") === "1";

  const regenerateQr =
    body.regenerateQr === true ||
    url.searchParams.get("regenerateQr") === "1" ||
    forceCanonicalUrl;

  if (mode === "batch") {
    const table = String(body.table || url.searchParams.get("table") || "") as ClaimSourceTable;

    if (!VALID_TABLES.includes(table)) {
      return NextResponse.json(
        { ok: false, error: "Invalid or missing table for batch repair." },
        { status: 400 },
      );
    }

    const offset = Number(body.offset ?? url.searchParams.get("offset") ?? 0);
    const batchSize = Number(body.batchSize ?? url.searchParams.get("batchSize") ?? 100);

    const result = await syncClaimFieldsToLocationsBatch({
      table,
      offset,
      batchSize,
      forceCanonicalUrl,
      regenerateQr,
    });

    return NextResponse.json({
      ok: true,
      mode: "batch",
      message: "Claim QR batch repaired.",
      result,
    });
  }

  const result = await syncClaimFieldsToLocations({
    forceCanonicalUrl,
    regenerateQr,
  });

  return NextResponse.json({
    ok: true,
    mode: "full",
    message: forceCanonicalUrl
      ? "Claim QR fields repaired and legacy URLs regenerated for TheOutHaven."
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
