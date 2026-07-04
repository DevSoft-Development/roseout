import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { approveLocationClaim, rejectLocationClaim } from "@/lib/locations/claims";
import { sendClaimApprovedEmail, sendClaimNeedsMoreInfoEmail, sendClaimRejectedEmail } from "@/lib/notifications";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request) {
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.claimsManage);
  if (auth.error) return auth.error;

  try {
    const { id, status } = await req.json();
    if (!id || !status) return Response.json({ error: "Missing id or status." }, { status: 400 });
    if (!["approved", "rejected", "needs_more_info"].includes(status)) return Response.json({ error: "Invalid status." }, { status: 400 });

    const { data: claim } = await supabaseAdmin
      .from("location_claim_requests")
      .select("id, owner_email, owner_name, location_name")
      .eq("id", id)
      .maybeSingle();
    if (!claim) return Response.json({ error: "Location claim request not found." }, { status: 404 });

    if (status === "approved") {
      await approveLocationClaim(id, { userId: auth.adminUser?.user_id || null });
      await sendClaimApprovedEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name, dashboardUrl: `${process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com"}/locations/dashboard` });
    } else if (status === "rejected") {
      await rejectLocationClaim(id, { userId: auth.adminUser?.user_id || null });
      await sendClaimRejectedEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name });
    } else {
      await supabaseAdmin.from("location_claim_requests").update({ status, reviewed_at: new Date().toISOString(), reviewed_by: auth.adminUser?.user_id || null, updated_at: new Date().toISOString() }).eq("id", id).throwOnError();
      await sendClaimNeedsMoreInfoEmail({ email: claim.owner_email, contactNameOrOwnerName: claim.owner_name, locationName: claim.location_name });
    }

    return Response.json({ success: true, dashboard_url: status === "approved" ? `${process.env.NEXT_PUBLIC_SITE_URL || "https://theouthaven.com"}/locations/dashboard` : null });
  } catch (error: any) {
    return Response.json({ error: error.message || "Server error" }, { status: error.status || 500 });
  }
}
