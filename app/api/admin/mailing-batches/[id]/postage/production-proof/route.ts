import { randomUUID } from "crypto";
import sharp from "sharp";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import {
  createStampsPostcardProductionProofViaIntegrationApi,
  getStampsStatusViaIntegrationApi,
  platformIntegrationApiConfigured,
} from "@/lib/aws/integration-api";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const TEMPLATE_BUCKET = "postcard-templates";

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
  const message = error instanceof Error ? error.message : "stamps_unavailable";
  return message.replace(/[\r\n\t]+/g, " ").slice(0, 500);
}

function labelWarningMessage(code: string | null) {
  if (!code) return null;
  const messages: Record<string, string> = {
    stamps_label_url_missing: "Live postage was purchased, but Stamps.com did not return a printable label URL.",
    stamps_label_url_invalid: "Live postage was purchased, but Stamps.com returned an invalid printable label URL.",
    stamps_label_url_unapproved: "Live postage was purchased, but Stamps.com returned an unexpected printable label URL.",
    stamps_label_download_failed: "Live postage was purchased, but its printable image could not be downloaded in AWS.",
    stamps_label_too_large: "Live postage was purchased, but its printable image exceeded the allowed size.",
    stamps_label_not_png: "Live postage was purchased, but Stamps.com did not return the requested PNG image.",
    stamps_label_download_deferred: "Live postage was purchased and recorded, but AWS skipped optional label download to return the known transaction before its execution deadline.",
  };
  return messages[code] || "Live postage was purchased, but its printable image needs manual review.";
}

async function cropAndSavePostageAsset(batchId: string, itemId: string, labelPngBase64: string) {
  const imageBytes = Buffer.from(labelPngBase64, "base64");
  if (!isPng(imageBytes)) throw new Error("AWS returned an invalid Stamps.com PNG payload.");
  const trimmed = await sharp(imageBytes)
    .flatten({ background: "#ffffff" })
    .trim({ background: "#ffffff", threshold: 12 })
    .extend({ top: 12, bottom: 12, left: 12, right: 12, background: "#ffffff" })
    .png()
    .toBuffer();
  const metadata = await sharp(trimmed).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 24 || metadata.height < 24) {
    throw new Error("AWS returned a Stamps.com PNG without usable postage artwork.");
  }
  const path = `production-proofs/${batchId}/${itemId}.png`;
  const { error: uploadError } = await supabaseAdmin.storage
    .from(TEMPLATE_BUCKET)
    .upload(path, trimmed, { contentType: "image/png", cacheControl: "60", upsert: true });
  if (uploadError) throw uploadError;
  return `${supabaseAdmin.storage.from(TEMPLATE_BUCKET).getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;
  const { id } = await params;

  if (!platformIntegrationApiConfigured()) {
    return Response.json({ success: false, error: "Controlled production postage is locked because the AWS Integration API is not configured." }, { status: 503 });
  }

  let status;
  try {
    status = await getStampsStatusViaIntegrationApi();
  } catch (error) {
    return Response.json({ success: false, error: safeError(error) }, { status: 502 });
  }
  if (
    status.mode !== "live"
    || status.apiVersion !== "v160"
    || !status.endpointApproved
    || !status.configured
    || !status.postcardEnabled
    || !status.livePurchasesEnabled
    || !status.transactionalOperationsEnabled
  ) {
    return Response.json({
      success: false,
      error: "Controlled production postage is locked in AWS. The approved v160 credential and explicit live-purchase switch must both be enabled first.",
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
    const proof = await createStampsPostcardProductionProofViaIntegrationApi({
      name: item.business_name,
      street: item.street_address,
      city: item.city,
      state: item.state,
      zip: item.zip_code,
    }, integratorTxId);

    const purchasedAt = new Date().toISOString();
    const { data: purchaseUpdated, error: purchaseUpdateError } = await supabaseAdmin
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
      .eq("stamps_integrator_tx_id", integratorTxId)
      .select("id")
      .maybeSingle();
    if (purchaseUpdateError || !purchaseUpdated) {
      console.error("Live Stamps postage purchased in AWS but transaction persistence failed", {
        itemId: item.id,
        integratorTxId,
        message: purchaseUpdateError?.message || "reserved transaction row was not updated",
      });
      return Response.json({
        success: false,
        charged: true,
        requiresManualReview: true,
        error: "AWS returned live Stamps.com postage, but the transaction record could not be finalized. Do not retry this postcard.",
      }, { status: 500 });
    }

    let postageAssetUrl: string | null = null;
    let assetWarning = labelWarningMessage(proof.labelWarning);
    if (proof.labelPngBase64) {
      try {
        postageAssetUrl = await cropAndSavePostageAsset(id, item.id, proof.labelPngBase64);
      } catch (assetError) {
        assetWarning = safeError(assetError);
      }
    }
    if (assetWarning) {
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
        itemId: item.id,
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
    await supabaseAdmin
      .from("mailing_batch_items")
      .update({ stamps_postage_status: "manual_review", stamps_postage_error: message })
      .eq("id", item.id)
      .eq("stamps_integrator_tx_id", integratorTxId);
    console.error("Controlled AWS Stamps production postcard requires manual review", {
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
