import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "editor", "viewer"]);
  if (auth.error) return auth.error;

  const sp = new URL(req.url).searchParams;
  let query = supabaseAdmin.from("admin_system_logs").select("*").order("created_at", { ascending: false });
  const category = sp.get("category");
  const level = sp.get("level");
  const entityType = sp.get("entity_type");
  const actor = sp.get("actor");
  const search = sp.get("search");
  if (category && category !== "all") query = query.eq("category", category);
  if (level && level !== "all") query = query.eq("level", level);
  if (entityType) query = query.eq("entity_type", entityType);
  if (actor) query = query.ilike("actor_email", `%${actor}%`);
  if (search) query = query.or(`message.ilike.%${search}%,action.ilike.%${search}%,source.ilike.%${search}%`);
  const { data, error } = await query.limit(Math.min(250, Number(sp.get("limit") || 100)));
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ logs: data || [] });
}
