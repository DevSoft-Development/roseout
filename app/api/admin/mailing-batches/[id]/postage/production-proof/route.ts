import { randomUUID } from "crypto";
import sharp from "sharp";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { getStampsConfiguration } from "@/lib/stamps-postcard";
import { runSinglePostcardProductionProof } from "@/lib/stamps-production-postcard";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const TEMPLATE_BUCKET = "postcard-templates";
const STAMPS_PRODUCTION_HOST = "swsim.stamps.com";

type BatchItem = {
  id: string;
  business_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  sequence_number: number | null;
  stamps_postage_status: string | null;
};

function isPng(bytes: Buffer) {
  return bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unknown Stamps.com production error.";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

async function cropToVisiblePostage(imageBytes: Buffer) {
  const trimmed = await sharp(imageBytes)
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 12 })
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: "#ffffff" })
    .png()
    .toBuffer();

  const metadata = await sharp(trimmed).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 24 || metadata.height < 24) {
    throw new Error("Stamps.com returned a PNG, but no usable live postage artwork was found inside it.");
  }
  return trimmed;
}

async function savePostageAsset(batchId: string, itemId: string, labelUrl: string) {
  let stampsUrl: URL;
  try {
    stampsUrl = new URL(labelUrl);
  } catch {
    throw new Error("Live postage was purchased, but Stamps.com returned an invalid printable label URL.");
  }

  if (stampsUrl.protocol !== "https:" || stampsUrl.hostname !== STAMPS_PRODUCTION_HOST || !stampsUrl.pathname.startsWith("/Label/")) {
    throw new Error("Live postage was purchased, but Stamps.com returned an unexpected printable label URL.");
  }

  const imageResponse = await fetch(stampsUrl, { cache: "no-store", redirect: "error" });
  if (!imageResponse.ok) {
    throw new Error(`Live postage was purchased, but its printable image could not be downloaded (${imageResponse.status}).`);
  }

  const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
  if (!isPng(imageBytes)) {
    throw new Error("Live postage was purchased, but Stamps.com did not return the requested PNG image.");
  }

  const postageBytes = await cropToVisiblePostage(imageBytes);
  const path = `production-proofs/${batchId}/${itemId}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, postageBytes, {
      contentType: "image/png",
      cacheControl: "60",
      upsert: true,
    });
  if (uploadError) throw uploadError;
  return `${supabaseAdmin.storage.from(TEMPLATE_BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;
  const config = getStampsConfiguration();
  if (config.mode !== "live" || !config.configured || !config.postcardEnabled || !config.livePurchasesEnabled) {
    return Response.json({
      success: false,
      error: "Controlled production postage is locked. Configure the production account and explicitly enable live purchases server-side first.",
    }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from("mailing_batch_items")
    .select("id,business_name,street_address,city,state,zip_code,sequence_number,stamps_postage_status")
    .eq("batch_id", id)
    .not("status", "eq", "cancelled")
    .is("stamps_postage_status", null)
    .order("sequence_number", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Could not select controlled production postcard", { message: error.message });
    return Response.json({ success: false, error: "Could not select an eligible postcard for the controlled production proof." }, { status: 500 });
  }
  if (!data) {
    return Response.json({ success: false, error: "No unattempted postcard is available. Existing live attempts must be reviewed instead of retried." }, { status: 409 });
  }

  const item = data as BatchItem;
  if (!item.street_address || !item.city || !item.state || !item.zip_code) {
    return Response.json({ success: false, error: "The selected postcard is missing a complete mailing address." }, { status: 409 });
  }

  const integratorTxId = `toh-postcard-live-${randomUUID()}`;
  const reservedAt = new Date().toISOString();

  // Compare-and-set reservation. Only one concurrent caller can move this item
  // from never-attempted (NULL) to reserved.
  const { data: reserved, error: reserveError } = await supabaseAdmin
    .from("mailing_batch_items")
    .update({
      stamps_integrator_tx_id: integratorTxId,
      stamps_postage_status: "reserved",
      stamps_postage_reserved_at: reservedAt,
      stamps_postage_error: null,
    })
    .eq("id", item.id)
    .is("stamps_postage_status", null)
    .select("id")
    .maybeSingle();

  if (reserveError) {
    console.error("Could not reserve controlled production postage", { message: reserveError.message });
    return Response.json({ success: false, error: "Could not reserve this postcard for a live postage attempt." }, { status: 500 });
  }
  if (!reserved) {
    return Response.json({ success: false, error: "Another live postage attempt already reserved this postcard. No Stamps.com call was made." }, { status: 409 });
  }

  try {
    const proof = await runSinglePostcardProductionProof({
      name: item.business_name,
      street: item.street_address,
      city: item.city,
      state: item.state,
      zip: item.zip_code,
    }, integratorTxId);

    const purchasedAt = new Date().toISOString();
    const { error: purchaseUpdateError } = await supabaseAdmin
      .from("mailing_batch_items")
      .update({
        stamps_tx_id: proof.stampsTxId,
        stamps_postage_status: "purchased",
        stamps_postage_amount: proof.amount,
        stamps_postage_ship_date: proof.shipDate,
        stamps_postage_purchased_at: purchasedAt,
        stamps_postage_error: null,
      })
      .eq("id", item.id)
      .eq("stamps_integrator_tx_id", integratorTxId);

    if (purchaseUpdateError) {
      // The indicium call succeeded. Never retry it because persistence failed.
      console.error("Live Stamps postage purchased but transaction persistence failed", {
        itemId: item.id,
        integratorTxId,
        message: purchaseUpdateError.message,
      });
      return Response.json({
        success: false,
        charged: true,
        requiresManualReview: true,
        error: "Stamps.com returned live postage, but the transaction record could not be finalized. Do not retry this postcard.",
      }, { status: 500 });
    }

    let postageAssetUrl: string | null = null;
    let assetWarning: string | null = null;
    if (proof.labelUrl) {
      try {
        postageAssetUrl = await savePostageAsset(id, item.id, proof.labelUrl);
      } catch (assetError) {
        assetWarning = safeError(assetError);
        await supabaseAdmin
          .from("mailing_batch_items")
          .update({ stamps_postage_error: assetWarning })
          .eq("id", item.id)
          .eq("stamps_integrator_tx_id", integratorTxId);
      }
    } else {
      assetWarning = "Live postage was purchased, but Stamps.com did not return a printable label URL.";
      await supabaseAdmin
        .from("mailing_batch_items")
        .update({ stamps_postage_error: assetWarning })
        .eq("id", item.id)
        .eq("stamps_integrator_tx_id", integratorTxId);
    }

    return Response.json({
      success: true,
      charged: true,
      batchId: id,
      itemId: item.id,
      sequenceNumber: item.sequence_number,
      proof: {
        businessName: proof.businessName,
        cleansedAddress: proof.cleansedAddress,
        addressMatch: proof.addressMatch,
        cityStateZipOk: proof.cityStateZipOk,
        amount: proof.amount,
        serviceType: proof.serviceType,
        packageType: proof.packageType,
        shipDate: proof.shipDate,
        stampsTxId: proof.stampsTxId,
        integratorTxId: proof.integratorTxId,
        postageAssetUrl,
        assetWarning,
        sampleOnly: false,
      },
    });
  } catch (error) {
    const message = safeError(error);
    // Once a live attempt is reserved, any error is treated as transaction-
    // ambiguous. Never clear the reservation and never automatically retry.
    await supabaseAdmin
      .from("mailing_batch_items")
      .update({
        stamps_postage_status: "manual_review",
        stamps_postage_error: message,
      })
      .eq("id", item.id)
      .eq("stamps_integrator_tx_id", integratorTxId);

    console.error("Controlled Stamps production postcard requires manual review", {
      itemId: item.id,
      integratorTxId,
      message,
    });
    return Response.json({
      success: false,
      charged: "unknown",
      requiresManualReview: true,
      error: `${message} This live attempt will not be retried automatically.`,
    }, { status: 502 });
  }
}
