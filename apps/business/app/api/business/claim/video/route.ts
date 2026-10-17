import crypto from "node:crypto";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { lookupSecureClaim, logClaimFunnelEvent } from "@/lib/business-claim/secureClaim";
import { getClaimMethodDecision } from "@/lib/business-claim/methodPolicy";

export const dynamic = "force-dynamic";
const BUCKET = "claim-verification-evidence";
const MAX_SIZE = 25 * 1024 * 1024;
const TYPES = new Map([["video/mp4","mp4"],["video/webm","webm"],["video/quicktime","mov"]]);
const hash = (text: string) => crypto.createHash("sha256").update(text).digest("hex");

// MIME types are client-controlled; verify the container signature before storage.
function validVideoSignature(bytes: Uint8Array, mime: string): boolean {
  if (mime === "video/mp4" || mime === "video/quicktime") {
    if (bytes.length < 12) return false;
    const box = String.fromCharCode(...bytes.subarray(4, 8));
    const brand = String.fromCharCode(...bytes.subarray(8, 12));
    return box === "ftyp" && /^[a-zA-Z0-9 ]{4}$/.test(brand);
  }
  return mime === "video/webm" && bytes.length >= 4 &&
    bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
}

export async function POST(request: Request) {
  const auth = await createClient();
  const { data } = await auth.auth.getUser();
  if (!data.user) return Response.json({ ok:false,error:"auth_required" }, { status:401 });
  const payload = await request.formData().catch(() => null);
  if (!payload) return Response.json({ ok:false,error:"invalid_request" }, { status:400 });
  const code = String(payload.get("code") || "");
  const file = payload.get("video");
  if (!(file instanceof File) || !TYPES.has(file.type) || file.size === 0 || file.size > MAX_SIZE)
    return Response.json({ ok:false,error:"invalid_video" }, { status:400 });
  const lookup = await lookupSecureClaim(code);
  if (!lookup.ok) return Response.json({ ok:false,error:"claim_unavailable" }, { status:409 });
  const decision = await getClaimMethodDecision(String(lookup.location.id));
  if (!decision.methods.includes("video_review")) return Response.json({ ok:false,error:"method_unavailable" }, { status:400 });
  const { count, error: rateError } = await supabaseAdmin.from("claim_video_challenges")
    .select("id",{count:"exact",head:true}).eq("claimant_user_id",data.user.id)
    .gte("created_at",new Date(Date.now()-86_400_000).toISOString());
  if (rateError) return Response.json({ok:false,error:"review_unavailable"},{status:503});
  if ((count ?? 0) >= 3) return Response.json({ok:false,error:"rate_limited"},{status:429});
  const id = crypto.randomUUID();
  const ext = TYPES.get(file.type)!;
  const storagePath = `${lookup.location.id}/${id}.${ext}`;
  // Private evidence; upload only from a trusted server route.
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validVideoSignature(bytes, file.type)) return Response.json({ok:false,error:"invalid_video"},{status:400});
  const uploaded = await supabaseAdmin.storage.from(BUCKET).upload(storagePath,bytes,{
    contentType:file.type,upsert:false,cacheControl:"no-store"
  });
  if (uploaded.error) return Response.json({ok:false,error:"upload_failed"},{status:503});
  const { error } = await supabaseAdmin.from("claim_video_challenges").insert({
    id,location_id:lookup.location.id,claimant_user_id:data.user.id,
    claim_code_hash:hash(lookup.code),storage_path:storagePath,status:"submitted",
    submitted_at:new Date().toISOString()
  });
  if (error) {
    await supabaseAdmin.storage.from(BUCKET).remove([storagePath]);
    return Response.json({ok:false,error:"submission_failed"},{status:503});
  }
  await logClaimFunnelEvent({locationId:String(lookup.location.id),eventType:"video_ownership_evidence_submitted",
    metadata:{method:"video",requiresOwnershipReview:true}});
  return Response.json({ok:true,submissionId:id,status:"submitted",ownershipApproved:false,
    message:"Video submitted for secure ownership review."});
}
