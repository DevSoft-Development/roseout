import { NextRequest } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor", "viewer"]); if (auth.error) return auth.error;
  const { id } = await params;
  const [r,a]= await Promise.all([
    supabaseAdmin.from("restaurants").select("reservation_link,reservation_link_found,reservation_link_source,reservation_link_checked_at").eq("id",id).maybeSingle(),
    supabaseAdmin.from("activities").select("reservation_link,reservation_link_found,reservation_link_source,reservation_link_checked_at").eq("id",id).maybeSingle(),
  ]);
  return Response.json({ reservation: r.data || a.data || null });
}
export async function PATCH(req: NextRequest,{ params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(["superuser", "admin", "editor"]); if (auth.error) return auth.error;
  const { id } = await params; const { reservation_link } = await req.json();
  await supabaseAdmin.from("restaurants").update({ reservation_link }).eq("id", id);
  await supabaseAdmin.from("activities").update({ reservation_link }).eq("id", id);
  return Response.json({ ok: true });
}
export async function POST(_: NextRequest){return Response.json({ ok:true, message:"Discovery trigger placeholder"});}
