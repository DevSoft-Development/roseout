import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]); if (auth.error) return auth.error;
  const { id } = await params;
  const patch = { needs_semantic_refresh: false, semantic_reviewed_at: new Date().toISOString() };
  await supabaseAdmin.from("restaurants").update(patch).eq("id", id);
  await supabaseAdmin.from("activities").update(patch).eq("id", id);
  return Response.json({ ok: true });
}
