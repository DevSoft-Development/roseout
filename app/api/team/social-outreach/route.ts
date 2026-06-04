import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureTeamProfileForCurrentUser, getActiveSession, isWorkspaceLocationPermitted } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

async function uploadProof(file: File, path: string) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { data, error } = await supabaseAdmin.storage.from("team-proofs").upload(path, bytes, { contentType: file.type || "application/octet-stream", upsert: false });
  if (error) throw error;
  const { data: signed } = await supabaseAdmin.storage.from("team-proofs").createSignedUrl(data.path, 60 * 60 * 24 * 7);
  return { path: data.path, url: signed?.signedUrl || data.path };
}

export async function POST(req: Request) {
  try {
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    if (!profile.can_do_social_outreach) return Response.json({ error: "Social outreach is not enabled for your team profile." }, { status: 403 });
    const active = await getActiveSession(user.id);
    if (!active) return Response.json({ error: "Start a work session before logging outreach." }, { status: 400 });
    const form = await req.formData();
    const locationId = String(form.get("locationId") || "").trim();
    const platform = String(form.get("platform") || "").trim();
    if (!locationId || !platform) return Response.json({ error: "Location and platform are required." }, { status: 400 });
    if (!(await isWorkspaceLocationPermitted(profile, locationId))) {
      return Response.json({ error: "This location is not assigned or permitted for your workspace profile." }, { status: 403 });
    }
    let socialProfileId = String(form.get("socialProfileId") || "").trim() || null;
    const handleOrUrl = String(form.get("handleOrUrl") || "").trim();
    if (!socialProfileId && handleOrUrl) {
      const { data: socialProfile, error } = await supabaseAdmin.from("location_social_profiles").insert({ location_id: locationId, platform, handle: handleOrUrl.startsWith("@") ? handleOrUrl : null, profile_url: handleOrUrl.startsWith("http") ? handleOrUrl : null, added_by: user.id, status: "needs_review" }).select("id").single();
      if (error) throw error;
      socialProfileId = socialProfile.id;
    }
    const proof = form.get("proof") as File | null;
    const proofUploaded = Boolean(proof && proof.size > 0);
    const { data: outreach, error } = await supabaseAdmin.from("ambassador_social_outreach").insert({ team_member_id: profile.id, assigned_team_member_id: profile.id, assigned_ambassador_id: profile.id, user_id: user.id, work_session_id: active.id, location_id: locationId, social_profile_id: socialProfileId, platform, handle_or_url: handleOrUrl || null, outreach_stage: form.get("outreachStage") || "message_sent", message_status: form.get("messageStatus") || "sent", reply_status: form.get("replyStatus") || "no_reply", template_id: form.get("templateId") || null, template_version: Number(form.get("templateVersion") || 1), message_sent_at: form.get("messageStatus") === "sent" ? new Date().toISOString() : null, last_contacted_at: new Date().toISOString(), follow_up_at: form.get("followUpAt") || null, proof_uploaded: proofUploaded, notes: form.get("notes") || null }).select("*").single();
    if (error) throw error;
    if (proofUploaded && proof) {
      const uploaded = await uploadProof(proof, `${user.id}/social/${outreach.id}/${Date.now()}-${proof.name}`);
      await supabaseAdmin.from("team_proofs").insert({ team_member_id: profile.id, ambassador_id: profile.id, user_id: user.id, location_id: locationId, source_type: "social_outreach", source_id: outreach.id, proof_type: "message_screenshot", file_url: uploaded.url, storage_bucket: "team-proofs", storage_path: uploaded.path });
    }
    if (form.get("followUpAt")) {
      await supabaseAdmin.from("team_follow_ups").insert({ team_member_id: profile.id, user_id: user.id, location_id: locationId, source_type: "social_outreach", source_id: outreach.id, follow_up_at: form.get("followUpAt"), follow_up_channel: platform, notes: form.get("notes") || null });
    }
    await supabaseAdmin.from("team_work_activities").insert({ team_member_id: profile.id, user_id: user.id, work_session_id: active.id, activity_type: "social_outreach", source_type: "social_outreach", source_id: outreach.id, location_id: locationId, status: "completed", notes: form.get("notes") || null });
    await supabaseAdmin.from("business_crm_notes").insert({ location_id: locationId, note: `Social outreach logged on ${platform}. Status: ${form.get("messageStatus") || "sent"}.`, note_type: "social_outreach", created_by: user.id }).then(undefined, () => undefined);
    revalidatePath("/my-workspace/social-outreach"); revalidatePath("/admin/dashboard/team/social-outreach");
    return Response.json({ outreach });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not save social outreach." }, { status: 400 });
  }
}
