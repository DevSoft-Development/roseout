import { supabase } from "@/lib/supabase";
import QRCode from "qrcode";
import crypto from "crypto";

async function generateQrCodeDataUrl(url: string) {
  try {
    return await QRCode.toDataURL(url, {
      margin: 2,
      width: 700,
    });
  } catch {
    return null;
  }
}

async function backfillTable({
  table,
  type,
}: {
  table: "restaurants" | "activities";
  type: "restaurant" | "activity";
}) {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com";

  const path = type === "activity" ? "claim-activity" : "claim";

  const { data: locations, error } = await supabase
    .from(table)
    .select("id, claim_token, claim_url, qr_code_data_url")
    .or("qr_code_data_url.is.null,claim_token.is.null,claim_url.is.null");

  if (error) throw new Error(error.message);

  let updated = 0;
  let failed = 0;

  for (const location of locations || []) {
    const claimToken = location.claim_token || crypto.randomUUID();
    const claimUrl = `${baseUrl}/${path}/${claimToken}`;
    const qrCodeDataUrl = await generateQrCodeDataUrl(claimUrl);

    const { error: updateError } = await supabase
      .from(table)
      .update({
        claim_token: claimToken,
        claim_url: claimUrl,
        claim_status: "unclaimed",
        qr_code_data_url: qrCodeDataUrl,
      })
      .eq("id", location.id);

    if (updateError) {
      failed++;
    } else {
      updated++;
    }
  }

  return { table, updated, failed };
}

async function runBackfill(req: Request) {
  const headerSecret = req.headers.get("x-internal-import-secret");
  const bearer = req.headers.get("authorization")?.replace("Bearer ", "");
  const incomingSecret = headerSecret || bearer;

  if (
    process.env.NODE_ENV !== "development" &&
    incomingSecret !== process.env.IMPORT_SECRET &&
    incomingSecret !== process.env.CRON_SECRET
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const restaurants = await backfillTable({
      table: "restaurants",
      type: "restaurant",
    });

    const activities = await backfillTable({
      table: "activities",
      type: "activity",
    });

    return Response.json({
      success: true,
      message: "QR backfill completed for all locations.",
      restaurants,
      activities,
      totalUpdated: restaurants.updated + activities.updated,
      totalFailed: restaurants.failed + activities.failed,
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  return runBackfill(req);
}

export async function POST(req: Request) {
  return runBackfill(req);
}