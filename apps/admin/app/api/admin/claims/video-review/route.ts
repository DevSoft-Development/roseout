import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const dynamic = "force-dynamic";
const BUCKET = "claim-verification-evidence";

export async function GET(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.claimsManage);
  if (auth.error) return auth.error;
  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (id) {
    const { data, error } = await supabaseAdmin.from("claim_video_challenges")
      .select("id,location_id,claimant_user_id,status,storage_path,submitted_at,reviewed_at,review_reason")
      .eq("id",id).maybeSingle();
    if (error || !data) return Response.json({error:"not_found"},{status:404});
    if (!data.storage_path) return Response.json({error:"evidence_missing"},{status:404});
    const signed = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(data.storage_path,120);
    if (signed.error || !signed.data) return Response.json({error:"evidence_unavailable"},{status:503});
    return Response.json({submission:data,videoUrl:signed.data.signedUrl,expiresInSeconds:120});
  }
  const { data, error } = await supabaseAdmin.from("claim_video_challenges")
    .select("id,location_id,claimant_user_id,status,submitted_at,reviewed_at,review_reason")
    .eq("status","submitted").order("submitted_at",{ascending:true}).limit(50);
  if (error) return Response.json({error:"review_queue_unavailable"},{status:503});
  return Response.json({submissions:data || []});
}
export async function PATCH(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.claimsManage);
  if (auth.error) return auth.error;
  const {id,decision,reason} = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(id)) || !["approved","rejected"].includes(decision) ||
      !String(reason || "").trim())
    return Response.json({error:"invalid_review"},{status:400});
  // Approving video evidence does not approve a location claim or grant any owner role.
  const { data, error } = await supabaseAdmin.from("claim_video_challenges")
    .update({status:decision,review_reason:String(reason).slice(0,2000),reviewed_at:new Date().toISOString()})
    .eq("id",id).eq("status","submitted").select("id,status,location_id").maybeSingle();
  if (error || !data) return Response.json({error:"already_reviewed_or_unavailable"},{status:409});
  return Response.json({ok:true,submission:data,ownershipApproved:false});
}

// Evidence deletion is independent from a claim decision; only claim administrators can invoke it.
export async function DELETE(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.claimsManage);
  if (auth.error) return auth.error;
  const { id } = await req.json().catch(() => ({}));
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) return Response.json({error:"invalid_id"},{status:400});
  const { data: evidence, error } = await supabaseAdmin.from("claim_video_challenges")
    .select("id,status,storage_path").eq("id",id).maybeSingle();
  if (error || !evidence) return Response.json({error:"not_found"},{status:404});
  if (evidence.status === "submitted") return Response.json({error:"review_required"},{status:409});
  if (evidence.storage_path) {
    const removed = await supabaseAdmin.storage.from(BUCKET).remove([evidence.storage_path]);
    if (removed.error) return Response.json({error:"storage_deletion_failed"},{status:503});
  }
  const { error: updateError } = await supabaseAdmin.from("claim_video_challenges")
    .update({storage_path:null}).eq("id",id).eq("status",evidence.status);
  if (updateError) return Response.json({error:"metadata_update_failed"},{status:503});
  return Response.json({ok:true,deleted:true});
}
