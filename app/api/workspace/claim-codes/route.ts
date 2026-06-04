import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { ensureTeamProfileForCurrentUser, isWorkspaceLocationPermitted } from "@/lib/team-tools";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic="force-dynamic";
function mask(value: string | null | undefined) { if (!value) return null; const [name, domain] = value.split("@"); return domain ? `${name.slice(0,2)}***@${domain}` : `${value.slice(0,3)}***`; }
export async function POST(req: Request) {
  try {
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    if (!profile.can_send_claim_codes) return Response.json({ error: "Claim-code sending is not enabled for your team profile." }, { status: 403 });
    const body = await req.json();
    const locationId = String(body.locationId || "");
    const channel = String(body.channel || "");
    if (!locationId || !channel) return Response.json({ error: "Location and channel are required." }, { status: 400 });
    if (!(await isWorkspaceLocationPermitted(profile, locationId))) return Response.json({ error: "This location is not assigned or permitted for your workspace profile." }, { status: 403 });
    const { data: location } = await supabaseAdmin.from("locations").select("id,name,location_name,owner_email,email,claim_status,do_not_contact,admin_review_status").eq("id", locationId).maybeSingle();
    if (!location) return Response.json({ error: "Location not found." }, { status: 404 });
    if ((location as any).do_not_contact) return Response.json({ error: "This location is marked do-not-contact." }, { status: 403 });
    if ((location as any).claim_status === "claimed" && !["superadmin","manager"].includes(profile.team_type)) return Response.json({ error: "This location is already claimed." }, { status: 403 });
    const sinceHour = new Date(Date.now() - 3600000).toISOString();
    const sinceDay = new Date(Date.now() - 86400000).toISOString();
    const [{ count: memberSends }, { count: locationSends }] = await Promise.all([
      supabaseAdmin.from("claim_code_audit_logs").select("id", { count: "exact", head: true }).eq("actor_user_id", user.id).gte("created_at", sinceHour),
      supabaseAdmin.from("claim_code_audit_logs").select("id", { count: "exact", head: true }).eq("location_id", locationId).gte("created_at", sinceDay),
    ]);
    if (!["superadmin","manager"].includes(profile.team_type) && (Number(memberSends||0) >= 5 || Number(locationSends||0) >= 3)) return Response.json({ error: "Claim-code send rate limit reached." }, { status: 429 });
    const code = randomBytes(5).toString("hex").toUpperCase();
    const target = ["email","sms"].includes(channel) ? mask((location as any).owner_email || (location as any).email) : null;
    const { data: claimCode, error } = await supabaseAdmin.from("location_claim_codes").insert({ location_id: locationId, code, status: "sent", sent_channel: channel, sent_platform: body.platform || null, sent_to_masked: target, sent_at: new Date().toISOString(), sent_by_user_id: user.id, sent_by_team_member_id: profile.id, expires_at: new Date(Date.now()+30*86400000).toISOString(), notes: body.notes || null }).select("*").single();
    if (error) throw error;
    await supabaseAdmin.from("claim_code_audit_logs").insert({ claim_code_id: claimCode.id, location_id: locationId, action: "sent", channel, platform: body.platform || null, actor_user_id: user.id, actor_team_member_id: profile.id, target_masked: target, notes: body.notes || null, metadata: { delivery_mode: ["email","sms"].includes(channel) ? "existing_contact_only" : "logged" } });
    await supabaseAdmin.from("team_work_activities").insert({ team_member_id: profile.id, user_id: user.id, activity_type: "claim_code_sent", source_type: "location_claim_codes", source_id: claimCode.id, location_id: locationId, status: "completed", notes: body.notes || null });
    revalidatePath("/my-workspace/claim-codes"); revalidatePath("/admin/dashboard/team/claim-code-audit");
    return Response.json({ claimCode: { ...claimCode, code: undefined } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Could not send claim code." }, { status: 400 }); }
}
