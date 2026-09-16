import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

function numberOrNull(value: FormDataEntryValue | null) {
  const text = String(value || "").trim();
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function POST(request: Request) {
  const admin = await requireAdminRole(ADMIN_PAGE_ACCESS.marketing);
  const form = await request.formData();
  const creatorSourceId = String(form.get("creator_source_id") || "");
  const campaignName = String(form.get("campaign_name") || "").trim();
  const paymentModel = String(form.get("payment_model") || "custom");
  if (!creatorSourceId || !campaignName) return NextResponse.json({ error: "Choose a creator and campaign." }, { status: 400 });
  if (!["flat","per_business","commission","hybrid","custom"].includes(paymentModel)) return NextResponse.json({ error: "Choose a valid payment option." }, { status: 400 });

  const { data: creator } = await supabaseAdmin.from("gtm_creator_sources").select("id,creator_key,display_name,platform,metadata").eq("id", creatorSourceId).maybeSingle();
  if (!creator) return NextResponse.json({ error: "Creator was not found." }, { status: 404 });
  const trackingKey = `${String(creator.platform || "creator").slice(0,12)}_${randomBytes(8).toString("hex")}`;
  const { data: partnership, error } = await supabaseAdmin.from("social_creator_partnerships").upsert({
    creator_source_id: creatorSourceId,
    status: "working_together",
    campaign_name: campaignName,
    payment_model: paymentModel,
    flat_fee: numberOrNull(form.get("flat_fee")),
    per_business_fee: numberOrNull(form.get("per_business_fee")),
    commission_percent: numberOrNull(form.get("commission_percent")),
    commission_months: numberOrNull(form.get("commission_months")),
    tracking_key: trackingKey,
    notes: String(form.get("notes") || "").trim() || null,
    created_by_user_id: admin.user_id,
    updated_at: new Date().toISOString(),
  }, { onConflict: "creator_source_id,campaign_name" }).select("id,tracking_key").single();
  if (error || !partnership) return NextResponse.json({ error: "The partnership could not be created." }, { status: 500 });

  if (form.get("create_filming_task") === "true") {
    const socialContactId = typeof creator.metadata?.social_contact_id === "string" ? creator.metadata.social_contact_id : null;
    let crmContactId: string | null = null;
    if (socialContactId) {
      const { data: socialContact } = await supabaseAdmin.from("social_community_contacts").select("linked_crm_contact_id").eq("id", socialContactId).maybeSingle();
      crmContactId = socialContact?.linked_crm_contact_id || null;
    }
    if (crmContactId) {
      const { data: existingTask } = await supabaseAdmin.from("crm_tasks").select("id").eq("source", "social_manager_creator").eq("source_record_id", partnership.id).is("archived_at", null).maybeSingle();
      if (!existingTask) {
        await supabaseAdmin.from("crm_tasks").insert({
          contact_id: crmContactId,
          title: `Film: ${campaignName}`,
          description: `Create the short-form video for ${creator.display_name}. Keep it natural, local, and useful.`,
          task_type: "outreach",
          status: "open",
          priority: "normal",
          assigned_team: "marketing",
          queue_key: "content",
          category: "marketing",
          subtype: "creator_filming_task",
          source: "social_manager_creator",
          source_record_id: partnership.id,
          created_by: admin.user_id,
          metadata: {
            partnership_id: partnership.id,
            creator_source_id: creator.id,
            tracking_key: partnership.tracking_key,
            video_length: "20–25 seconds",
            shots: ["Show the restaurant or location entrance","Show one or two food or feature shots","Show the activity or main experience","Show the overall vibe","Record one short closing shot"],
            suggested_opening: "Here’s your next night out with TheOutHaven.",
          },
        });
      }
    }
  }
  return NextResponse.redirect(new URL("/admin/dashboard/marketing/creators?created=1", request.url), 303);
}
