import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { runSinglePostcardStagingProof } from "@/lib/stamps-staging-postcard";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;

type BatchItem = {
  id: string;
  business_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  sequence_number: number | null;
};

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

    return Response.json({
      success: true,
      batchId: id,
      itemId: item.id,
      sequenceNumber: item.sequence_number,
      proof,
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
