import { ensureTeamProfileForCurrentUser, isWorkspaceLocationPermitted } from "@/lib/team-tools";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const dynamic="force-dynamic";
function mask(email: string | null | undefined) { if (!email) return null; const [name, domain] = email.split("@"); return domain ? `${name.slice(0,2)}***@${domain}` : "***"; }
export async function POST(req: Request) {
  const { user, profile } = await ensureTeamProfileForCurrentUser();
  const body = await req.json();
  const locationId = String(body.locationId || "");
  const reason = String(body.reason || "").trim();
  if (!profile.can_send_owner_password_reset) return Response.json({ error: "Owner password reset assistance is not enabled for your team profile." }, { status: 403 });
  if (!reason) return Response.json({ error: "A reason or linked support context is required." }, { status: 400 });
  if (locationId && !(await isWorkspaceLocationPermitted(profile, locationId))) return Response.json({ error: "This location is not assigned or permitted for your workspace profile." }, { status: 403 });
  const { data: location } = locationId ? await supabaseAdmin.from("locations").select("id,owner_user_id,owner_email,email").eq("id", locationId).maybeSingle() : { data: null } as any;
  const targetEmail = (location as any)?.owner_email || (location as any)?.email || null;
  if (!targetEmail) {
    await supabaseAdmin.from("password_reset_audit_logs").insert({ location_id: locationId || null, requested_by_user_id: user.id, requested_by_team_member_id: profile.id, reason, status: "no_existing_owner_email" });
    return Response.json({ error: "No existing owner/account email is on file. Request a protected contact-field change first." }, { status: 400 });
  }
  const sinceDay = new Date(Date.now() - 86400000).toISOString();
  const { count } = await supabaseAdmin.from("password_reset_audit_logs").select("id", { count: "exact", head: true }).eq("target_email_masked", mask(targetEmail)).gte("created_at", sinceDay);
  if (Number(count || 0) >= 3) return Response.json({ error: "Password reset rate limit reached for this owner account." }, { status: 429 });
  const providerResponse = { mode: "service_role_server_only", masked_email: mask(targetEmail) };
  await supabaseAdmin.from("password_reset_audit_logs").insert({ target_user_id: (location as any)?.owner_user_id || null, target_email_masked: mask(targetEmail), location_id: locationId || null, ticket_id: body.ticketId || null, requested_by_user_id: user.id, requested_by_team_member_id: profile.id, reason, status: "logged_for_secure_delivery", provider_response: providerResponse });
  return Response.json({ status: "logged_for_secure_delivery", targetEmailMasked: mask(targetEmail) });
}
