import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureCrmTaskForSource } from "@/lib/crm/tasks/service";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const ACTIONS = ["queued", "printed", "mailed", "completed", "cancelled"] as const;
type BatchAction = (typeof ACTIONS)[number];

type MailingClaimItem = {
  location_id: string | null;
  claim_code: string | null;
  business_name?: string | null;
};

function addBusinessDays(start: Date, count: number) {
  const date = new Date(start);
  let added = 0;
  while (added < count) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  date.setHours(17, 0, 0, 0);
  return date;
}

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "") as BatchAction;

    if (!ACTIONS.includes(action)) {
      return Response.json({ success: false, error: "Unsupported mailing batch action." }, { status: 400 });
    }

    const nowDate = new Date();
    const now = nowDate.toISOString();
    const batchUpdate: Record<string, unknown> = { status: action };
    if (action === "mailed") batchUpdate.mailed_at = now;
    if (action === "completed") batchUpdate.completed_at = now;

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("mailing_batches")
      .update(batchUpdate)
      .eq("id", id)
      .select("id,status")
      .maybeSingle();

    if (batchError) throw batchError;
    if (!batch) return Response.json({ success: false, error: "Mailing batch not found." }, { status: 404 });

    if (action === "printed") {
      const { error } = await supabaseAdmin
        .from("mailing_batch_items")
        .update({ status: "printed", printed_at: now })
        .eq("batch_id", id)
        .in("status", ["queued", "printed"]);
      if (error) throw error;
    } else if (action === "mailed") {
      const { data: claimItems, error: claimItemError } = await supabaseAdmin
        .from("mailing_batch_items")
        .select("location_id,claim_code,business_name")
        .eq("batch_id", id)
        .not("status", "eq", "cancelled");
      if (claimItemError) throw claimItemError;

      const eligible = ((claimItems || []) as MailingClaimItem[]).filter(
        (item) => item.location_id && item.claim_code,
      );

      if (eligible.length) {
        const claimRows = eligible.map((item) => ({
          location_id: item.location_id,
          code: item.claim_code,
          claim_code: item.claim_code,
          status: "sent",
          sent_channel: "postcard",
          sent_platform: "theouthaven_mailing_batches",
          sent_at: now,
          sent_by_user_id: auth.adminUser?.user_id || null,
          updated_at: now,
        }));

        const { error: claimCodeError } = await supabaseAdmin
          .from("location_claim_codes")
          .upsert(claimRows, { onConflict: "code" });
        if (claimCodeError) throw claimCodeError;

        const locationIds = eligible.map((item) => item.location_id as string);
        const { error: locationError } = await supabaseAdmin
          .from("locations")
          .update({ claim_status: "sent", claim_sent_at: now, claim_outreach_channel: "postcard" })
          .in("id", locationIds);
        if (locationError) throw locationError;

        const actor = {
          user_id: auth.adminUser?.user_id || "00000000-0000-0000-0000-000000000000",
          role: auth.adminUser?.role || "admin",
        };
        const dueAt = addBusinessDays(nowDate, 2).toISOString();

        for (const item of eligible) {
          if (!item.location_id) continue;
          await ensureCrmTaskForSource(
            {
              sourceSystem: "mailing_batch_item",
              sourceRecordId: `${id}:${item.location_id}`,
              taskType: "postcard_social_follow",
              location_id: item.location_id,
              title: `Find & follow ${item.business_name || "location"} on social media`,
              description:
                "Postcard mailed. Find the location's Instagram, Facebook, and TikTok profiles where available; follow from the approved TheOutHaven account and save verified social handles to the location record.",
              status: "open",
              priority: "normal",
              queue_key: "outreach",
              category: "postcard_follow_up",
              subtype: "social_follow",
              workflow_key: "claim_postcard_follow_up",
              workflow_stage: "social_follow",
              due_at: dueAt,
              reminder_at: dueAt,
              metadata: {
                mailing_batch_id: id,
                claim_code: item.claim_code,
                action: "find_and_follow_social",
              },
            },
            actor,
          );
        }
      }

      const { error } = await supabaseAdmin
        .from("mailing_batch_items")
        .update({ status: "mailed", mailed_at: now })
        .eq("batch_id", id)
        .in("status", ["queued", "printed", "mailed"]);
      if (error) throw error;
    } else if (action === "cancelled") {
      const { error } = await supabaseAdmin
        .from("mailing_batch_items")
        .update({ status: "cancelled" })
        .eq("batch_id", id)
        .in("status", ["queued", "printed"]);
      if (error) throw error;
    } else if (action === "queued") {
      const { error } = await supabaseAdmin
        .from("mailing_batch_items")
        .update({ status: "queued" })
        .eq("batch_id", id)
        .in("status", ["queued", "printed"]);
      if (error) throw error;
    }

    return Response.json({ success: true, status: action });
  } catch (error) {
    console.error("Mailing batch status update failed", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Could not update mailing batch." },
      { status: 500 },
    );
  }
}
