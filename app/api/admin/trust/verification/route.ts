import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { reviewOrganizationVerification, reviewOrganizerVerification } from "@/lib/organizations/verification";

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.claims);
  if (auth.error) return auth.error;
  const type = new URL(req.url).searchParams.get("type") === "organizer" ? "organizer" : "organization";
  const table = type === "organizer" ? "organizer_verification_requests" : "organization_verification_requests";
  const { data, error } = await supabaseAdmin.from(table).select("*").in("status", ["pending","needs_more_info"]).order("created_at", { ascending: true }).limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const organizationIds = Array.from(new Set((data || []).map((row: any) => row.organization_id).filter(Boolean)));
  const { data: organizations } = organizationIds.length
    ? await supabaseAdmin.from("organizations").select("id,name,legal_name,organization_type,verification_status,trust_level").in("id", organizationIds)
    : { data: [] as any[] };
  const organizationMap = new Map((organizations || []).map((row: any) => [row.id, row]));
  return Response.json({ success: true, type, requests: (data || []).map((row: any) => ({ ...row, organization: organizationMap.get(row.organization_id) || null })) });
}

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.claimsManage);
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const type = body?.type === "organizer" ? "organizer" : "organization";
    const decision = String(body?.decision || "");
    if (!["approved","rejected","needs_more_info"].includes(decision)) return Response.json({ error: "Invalid decision." }, { status: 400 });
    const actorUserId = auth.adminUser?.user_id;
    if (!actorUserId) return Response.json({ error: "Admin user is not linked." }, { status: 403 });

    if (type === "organizer") {
      await reviewOrganizerVerification({ actorUserId, requestId: String(body.requestId || ""), decision: decision as any, notes: body.notes || null, approvedTrustLevel: Number(body.approvedTrustLevel || 1) });
    } else {
      await reviewOrganizationVerification({ actorUserId, requestId: String(body.requestId || ""), decision: decision as any, notes: body.notes || null });
    }
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Unable to review verification." }, { status: 400 });
  }
}
