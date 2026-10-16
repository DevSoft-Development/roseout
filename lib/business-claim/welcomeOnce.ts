import "server-only";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { sendClaimApprovedEmail } from "@/lib/notifications";

// Reserve once, before delivery. Ambiguous provider timeouts are intentionally NOT
// retried automatically: that could duplicate mail. An admin may resolve failed rows.
export async function sendClaimWelcomeOnce(input: {
  claimId:string;locationId?:string|null;email?:string|null;name?:string|null;
  locationName:string;dashboardUrl?:string|null;
}) {
  if (!input.email) return { status:"skipped_no_email" as const };
  const { data: claim, error: claimError } = await supabaseAdmin.from("location_claim_requests")
    .select("id,status,location_id").eq("id",input.claimId).maybeSingle();
  if (claimError || !claim || claim.status !== "approved") return {status:"not_approved" as const};
  const { data: reserved, error } = await supabaseAdmin.from("claim_welcome_deliveries")
    .upsert({claim_id:input.claimId,location_id:input.locationId||claim.location_id,
      recipient_email:input.email,status:"reserved"},{onConflict:"claim_id",ignoreDuplicates:true})
    .select("claim_id").maybeSingle();
  if (error) throw error;
  if (!reserved) return {status:"already_reserved" as const};
  try {
    const result = await sendClaimApprovedEmail({email:input.email,contactNameOrOwnerName:input.name,
      locationName:input.locationName,dashboardUrl:input.dashboardUrl});
    const issue = result && typeof result === "object" && "errors" in result &&
      Array.isArray(result.errors) && result.errors.length ? String(result.errors.join("; ")) : null;
    await supabaseAdmin.from("claim_welcome_deliveries").update({
      status:issue?"failed":"sent",sent_at:issue?null:new Date().toISOString(),last_error:issue
    }).eq("claim_id",input.claimId).eq("status","reserved");
    return {status:issue?"failed":"sent" as const};
  }catch(err) {
    await supabaseAdmin.from("claim_welcome_deliveries").update({
      status:"failed",last_error:err instanceof Error?err.message:"delivery_failed"
    }).eq("claim_id",input.claimId).eq("status","reserved");
    return {status:"failed" as const};
  }
}
