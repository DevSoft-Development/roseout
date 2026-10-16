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
