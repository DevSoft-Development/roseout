import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ensureClaimFields, syncClaimFieldsToLocations } from "@/lib/claimQrServer";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

type Table = "locations" | "restaurants" | "activities";

function isTable(value: unknown): value is Table {
  return value === "locations" || value === "restaurants" || value === "activities";
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();

    if (body.action === "sync") {
      const result = await syncClaimFieldsToLocations();
      return Response.json({ success: true, ...result });
    }

    if (!isTable(body.source_table) || !body.source_id) {
      return Response.json({ error: "Missing source table or source id." }, { status: 400 });
    }

    const table = body.source_table as Table;
    const id = String(body.source_id);
    const selectFields =
      table === "locations"
        ? "id, source_table, source_id, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url"
        : "id, claim_code, claim_token, claim_url, claim_qr_url, qr_link, qr_code_data_url";
    const { data: row, error } = await supabaseAdmin
      .from(table)
      .select(selectFields)
      .eq("id", id)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!row) return Response.json({ error: "Location not found." }, { status: 404 });

    const claimRow = row as unknown as Record<string, unknown>;
    const fields = await ensureClaimFields(claimRow, {
      table,
      regenerateCode: body.field === "claim_code" || body.field === "all",
      regenerateToken: body.field === "claim_token" || body.field === "qr" || body.field === "all",
      regenerateQr: body.field === "qr" || body.field === "all",
    });

    const { error: updateError } = await supabaseAdmin.from(table).update(fields).eq("id", id);
    if (updateError) return Response.json({ error: updateError.message }, { status: 500 });

    if (table === "restaurants" || table === "activities") {
      await supabaseAdmin
        .from("locations")
        .update(fields)
        .eq("source_table", table)
        .eq("source_id", id);
    } else if (claimRow.source_table && claimRow.source_id && ["restaurants", "activities"].includes(String(claimRow.source_table))) {
      await supabaseAdmin
        .from(String(claimRow.source_table) as "restaurants" | "activities")
        .update(fields)
        .eq("id", String(claimRow.source_id));
    }

    return Response.json({ success: true, fields });
  } catch (error: unknown) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Server error" },
      { status: 500 },
    );
  }
}
