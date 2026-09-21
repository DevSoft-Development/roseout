import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

const severities = new Set(["low","medium","high","critical"]);
const statuses = new Set(["open","investigating","resolved"]);

export async function GET() {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const { data, error } = await supabaseAdmin.from("ai_trust_incidents").select("*").order("created_at",{ascending:false}).limit(100);
  if (error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true, incidents:data || []});
}

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const body = await request.json().catch(()=>({}));
  const summary = String(body.summary || "").trim().slice(0,1000);
  const surface = String(body.surface || "").trim().slice(0,120);
  const severity = severities.has(String(body.severity)) ? String(body.severity) : "medium";
  if (!summary || !surface) return NextResponse.json({error:"Surface and summary are required."},{status:400});
  const payload = {
    summary, surface, severity, status:"open",
    request_id: String(body.requestId || "").trim().slice(0,200) || null,
    provider: String(body.provider || "").trim().slice(0,100) || null,
    model: String(body.model || "").trim().slice(0,120) || null,
  };
  const { data, error } = await supabaseAdmin.from("ai_trust_incidents").insert(payload).select("*").single();
  if (error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true, incident:data},{status:201});
}

export async function PATCH(request: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.searchHealth);
  if (auth.error) return auth.error;
  const body = await request.json().catch(()=>({}));
  const id = String(body.id || "").trim();
  const status = statuses.has(String(body.status)) ? String(body.status) : null;
  if (!id || !status) return NextResponse.json({error:"Incident id and valid status are required."},{status:400});
  const update: Record<string, unknown> = {
    status,
    updated_at:new Date().toISOString(),
    resolution:String(body.resolution || "").trim().slice(0,2000) || null,
  };
  if (status === "resolved") update.resolved_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin.from("ai_trust_incidents").update(update).eq("id",id).select("*").single();
  if (error) return NextResponse.json({error:error.message},{status:500});
  return NextResponse.json({ok:true, incident:data});
}
