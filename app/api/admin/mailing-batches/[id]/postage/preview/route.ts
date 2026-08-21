import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { getStampsConfiguration, quoteFirstClassPostcards, validatePostcardAddress } from "@/lib/stamps-postcard";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;

type BatchItem = {
  id: string;
  business_name: string;
  street_address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
};

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  const { id } = await params;

  try {
    const { data, error } = await supabaseAdmin
      .from("mailing_batch_items")
      .select("id,business_name,street_address,city,state,zip_code")
      .eq("batch_id", id)
      .not("status", "eq", "cancelled")
      .limit(1000);

    if (error) throw error;

    const items = (data || []) as BatchItem[];
    if (!items.length) {
      return Response.json({ success: false, error: "This batch has no eligible postcards." }, { status: 409 });
    }

    const validations = await Promise.all(
      items.map(async (item) => ({
        id: item.id,
        businessName: item.business_name,
        result: await validatePostcardAddress({
          name: item.business_name,
          street: item.street_address || "",
          city: item.city || "",
          state: item.state || "",
          zip: item.zip_code || "",
        }),
      })),
    );

    const invalid = validations.filter((entry) => !entry.result.valid);
    const quote = await quoteFirstClassPostcards(items.length);
    const config = getStampsConfiguration();

    return Response.json({
      success: true,
      batchId: id,
      postcardSize: "4x6",
      quantity: items.length,
      validAddressCount: items.length - invalid.length,
      invalidAddressCount: invalid.length,
      invalidAddresses: invalid.slice(0, 25).map((entry) => ({
        id: entry.id,
        businessName: entry.businessName,
        warnings: entry.result.warnings,
      })),
      quote,
      integration: {
        mode: config.mode,
        configured: config.configured,
        postcardEnabled: config.postcardEnabled,
        livePurchasesEnabled: config.livePurchasesEnabled,
      },
    });
  } catch (error) {
    console.error("Postcard postage preview failed", error);
    return Response.json({ success: false, error: "Could not prepare the postage preview." }, { status: 500 });
  }
}
