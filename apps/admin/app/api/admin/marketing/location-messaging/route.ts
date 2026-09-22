import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.campaigns);
  if (error) return error;
  const db = getAdminDatabaseClient();
  const { data: campaigns, error: campaignError } = await db
    .from("location_messaging_campaigns")
    .select("id,location_id,name,channel,status,subject,body_rendered,recipient_count,requires_admin_approval,created_at,updated_at")
    .eq("requires_admin_approval", true)
    .in("status", ["pending_approval", "approved", "rejected"])
    .order("updated_at", { ascending: false })
    .limit(100);
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });

  const locationIds = [...new Set((campaigns || []).map((campaign: any) => String(campaign.location_id)))];
  const { data: locations } = locationIds.length
    ? await db.from("locations").select("id,name,restaurant_name,activity_name,city,state").in("id", locationIds)
    : { data: [] as any[] };
  const locationMap = new Map((locations || []).map((location: any) => [String(location.id), location]));

  return NextResponse.json({
    campaigns: (campaigns || []).map((campaign: any) => {
      const location: any = locationMap.get(String(campaign.location_id));
      return {
        ...campaign,
        location_name: location?.name || location?.restaurant_name || location?.activity_name || "Business location",
        location_city: location?.city || null,
        location_state: location?.state || null,
      };
    }),
  });
}

export async function PATCH(request: Request) {
  const { adminUser, error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.campaignsSend);
  if (error || !adminUser) return error;
  const body = await request.json().catch(() => ({}));
  const id = String(body.id || body.campaign_id || "").trim();
  const action = String(body.action || "").trim();
  if (!id || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "Campaign id and approval action are required." }, { status: 400 });
  }

  const db = getAdminDatabaseClient();
  const { data: campaign, error: campaignError } = await db
    .from("location_messaging_campaigns")
    .select("id,channel,status,requires_admin_approval,metadata")
    .eq("id", id)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: campaignError.message }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  if (campaign.channel !== "sms" || !campaign.requires_admin_approval) {
    return NextResponse.json({ error: "Only approval-controlled SMS campaigns can use this workflow." }, { status: 409 });
  }
  if (campaign.status !== "pending_approval") {
    return NextResponse.json({ error: "Only pending campaigns can be approved or rejected." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const actorId = String((adminUser as any).user_id || (adminUser as any).id || "") || null;
  const reason = String(body.reason || "").trim().slice(0, 500);
  const updates = action === "approve"
    ? {
        status: "approved",
        approved_by: actorId,
        approved_at: now,
        rejected_by: null,
        rejected_at: null,
        rejected_reason: null,
        metadata: { ...(campaign.metadata || {}), approval_source: "admin_marketing_approvals" },
        updated_at: now,
      }
    : {
        status: "rejected",
        rejected_by: actorId,
        rejected_at: now,
        rejected_reason: reason || "Not approved for SMS delivery.",
        approved_by: null,
        approved_at: null,
        metadata: { ...(campaign.metadata || {}), approval_source: "admin_marketing_approvals" },
        updated_at: now,
      };

  const { error: updateError } = await db.from("location_messaging_campaigns").update(updates).eq("id", id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: updates.status });
}
