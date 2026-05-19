import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ensureClaimFields } from "@/lib/claimQr";
import { supabaseAdmin } from "@/lib/supabase-admin";

async function getRow(id: string) {
  const r = await supabaseAdmin.from("restaurants").select("id,claim_code,claim_token,claim_url,claim_qr_url,qr_code_data_url,claim_status").eq("id", id).maybeSingle();
  if (r.data) return { table: "restaurants" as const, row: r.data };
  const a = await supabaseAdmin.from("activities").select("id,claim_code,claim_token,claim_url,claim_qr_url,qr_code_data_url,claim_status").eq("id", id).maybeSingle();
  if (a.data) return { table: "activities" as const, row: a.data };
  return null;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]); if (auth.error) return auth.error;
  const { id } = await params; const found = await getRow(id); if (!found) return Response.json({ claim: null });
  return Response.json({ claim: found.row });
}
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]); if (auth.error) return auth.error;
  const { id } = await params; const found = await getRow(id); if (!found) return Response.json({ error: "Not found" }, { status: 404 });
  const fields = await ensureClaimFields(found.row, { table: found.table });
  await supabaseAdmin.from(found.table).update(fields).eq("id", id);
  return Response.json({ claim: { ...found.row, ...fields } });
}
export async function PATCH(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]); if (auth.error) return auth.error;
  const { id } = await params; const found = await getRow(id); if (!found) return Response.json({ error: "Not found" }, { status: 404 });
  const fields = await ensureClaimFields(found.row, { table: found.table, regenerateCode: true, regenerateToken: true, regenerateQr: true });
  await supabaseAdmin.from(found.table).update(fields).eq("id", id);
  return Response.json({ claim: { ...found.row, ...fields } });
}
