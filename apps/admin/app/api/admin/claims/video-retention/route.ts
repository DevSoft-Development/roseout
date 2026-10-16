import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";
export const dynamic = "force-dynamic";
const BUCKET = "claim-verification-evidence";
// A protected, manually triggered cleanup entry point. A scheduled job can invoke a separate service-role workflow after certification.
export async function POST() {
 const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.claimsManage);
 if (auth.error) return auth.error;
 const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
 const { data, error } = await supabaseAdmin.from("claim_video_challenges")
  .select("id,storage_path,status,reviewed_at,created_at")
  .in("status",["approved","rejected","expired"]).lt("created_at",cutoff).limit(50);
 if (error) return Response.json({error:"cleanup_query_failed"},{status:503});
 let deleted = 0; let failed = 0;
 for (const item of data || []) {
  // Never remove pending review evidence; keep audit metadata after deleting the media.
  if (!item.storage_path) continue;
  const result = await supabaseAdmin.storage.from(BUCKET).remove([item.storage_path]);
  if (result.error) {failed++;continue;}
  const update = await supabaseAdmin.from("claim_video_challenges").update({storage_path:null}).eq("id",item.id)
    .eq("status",item.status).eq("storage_path",item.storage_path);
  if (update.error) {failed++;continue;}
  deleted++;
 }
 return Response.json({ok:failed===0,deleted,failed,remainingPossible:(data||[]).length===50});
}
