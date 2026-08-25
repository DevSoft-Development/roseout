import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { runSinglePostcardStagingProof } from "@/lib/stamps-staging-postcard";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const TEMPLATE_BUCKET = "postcard-templates";
const STAMPS_STAGING_HOST = "swsim.testing.stamps.com";

type BatchItem = {
  id: string;
  business_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  sequence_number: number | null;
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

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("mailing_batch_items")
      .select("id,business_name,street_address,city,state,zip_code,sequence_number")
      .eq("batch_id", id)
      .not("status", "eq", "cancelled")
      .order("sequence_number", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return Response.json({ success: false, error: "This batch has no eligible postcard to test." }, { status: 409 });
    }

    const item = data as BatchItem;
    if (!item.street_address || !item.city || !item.state || !item.zip_code) {
      return Response.json({ success: false, error: "The first postcard in this batch is missing a complete mailing address." }, { status: 409 });
    }

    const proof = await runSinglePostcardStagingProof({
      name: item.business_name,
      street: item.street_address,
      city: item.city,
      state: item.state,
      zip: item.zip_code,
    });

    if (!proof.labelUrl) {
      throw new Error("Stamps.com created the staging postage but did not return the printable label image URL.");
    }

    let stampsUrl: URL;
    try {
      stampsUrl = new URL(proof.labelUrl);
    } catch {
      throw new Error("Stamps.com created the staging postage but returned an invalid printable label URL.");
    }

    if (stampsUrl.protocol !== "https:" || stampsUrl.hostname !== STAMPS_STAGING_HOST || !stampsUrl.pathname.startsWith("/Label/")) {
      throw new Error("Stamps.com returned an unexpected staging label URL. The proof was not added to the postcard print center.");
    }

    const imageResponse = await fetch(stampsUrl, {
      cache: "no-store",
      redirect: "error",
    });
    if (!imageResponse.ok) {
      throw new Error(`Stamps.com created the postage, but its printable image could not be downloaded (${imageResponse.status}).`);
    }

    const imageBytes = Buffer.from(await imageResponse.arrayBuffer());
    if (!isPng(imageBytes)) {
      const contentType = imageResponse.headers.get("content-type")?.split(";")[0]?.trim() || "unknown format";
      throw new Error(`Stamps.com returned ${contentType} instead of the requested PNG postage image. The proof was not added to the postcard print center.`);
    }

    const stagingPath = `staging-proofs/${id}/${item.id}.png`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(TEMPLATE_BUCKET)
      .upload(stagingPath, imageBytes, {
        contentType: "image/png",
        cacheControl: "60",
        upsert: true,
      });
    if (uploadError) throw uploadError;

    const stagingAssetUrl = supabaseAdmin.storage.from(TEMPLATE_BUCKET).getPublicUrl(stagingPath).data.publicUrl;
    const printCenterUrl = `/admin/dashboard/operations/mailing-batches/${id}/print?mode=duplex&staging=1&item=${encodeURIComponent(item.id)}`;
    const { imageDataBase64: _imageDataBase64, ...clientProof } = proof;

    return Response.json({
      success: true,
      batchId: id,
      itemId: item.id,
      sequenceNumber: item.sequence_number,
      proof: {
        ...clientProof,
        labelUrl: printCenterUrl,
        stagingAssetUrl: `${stagingAssetUrl}?v=${Date.now()}`,
      },
    });
  } catch (error) {
    console.error("Stamps single-postcard staging proof failed", error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Could not create the Stamps.com staging postcard proof.",
      },
      { status: 500 },
    );
  }
}
